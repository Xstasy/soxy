import express, { Express, NextFunction, Request, Response } from 'express'
import { Server as Sockets, Socket as Client } from 'socket.io';
import { PrismaClient, Session } from '@prisma/client'
import { EventEmitter2 } from 'eventemitter2'
import { sign, verify } from 'jsonwebtoken'
import http from 'http'
import path from 'path'
import pug from 'pug'
import fs from 'fs'

let fsTimeout : any;

export class Soxy extends EventEmitter2 {

    public static instance: Soxy
    public static database: PrismaClient
    public static webserver: Express
    public static http: http.Server
    public static sockets: Sockets
    public static router: Router

    public static listen(port: number = 1337, cb: any) {
        if (!Soxy.instance) {
            this.instance  = new Soxy()

            this.database  = new PrismaClient()
            this.webserver = express();
            this.http      = http.createServer(this.webserver)
            this.sockets   = new Sockets(this.http)
            this.router    = new Router()

            // Use pug as view engine
            this.webserver.set('view engine', 'pug');
            this.webserver.set('views', path.join(process.cwd(), 'ui/page'));

            // Decode x-www-form-urlencoded & JSON bodies.
            this.webserver.use(express.json());
            this.webserver.use(express.urlencoded({ extended: true }));

            // Static assets (CSS/JS/Images)
            this.webserver.use('/assets', express.static(path.join(process.cwd(), 'public')));

            // Make sure to attach cookie/session to incoming sockets.
            this.sockets.use(async(socket: Socket, next) => {
                const cookie  = Soxy.Cookie(socket.request?.headers?.cookie?.toString() || '');
                const session = socket.session = await this.Session(<Request>socket.request, cookie);
                try {        
                    if(session) next()
                } catch(error) {}
            })

            // Attach render method to incoming sockets
            this.sockets.on('connection', (socket: Socket) => {
                const session  = socket.session;
    
                socket.render = async(route, locals?) => {
                    let file = route;
                    if(route === '/') file = 'index'
    
                    let start       = Date.now()
                    socket.route    = route
                    locals.session  = socket.session
    
                    socket.emit('render', route, await Router.render(file, locals, socket), locals)
                    console.log(`${session.id} rendered ${route} in ${Date.now()-start}ms`)
                }
                // Listen for navigation
                socket.on('soxy:navigate', (path) => this.router.emit(path, socket))
    
            })

            // Express main app
            this.webserver.get('/', this.app)

            // Webserver listen
            this.http.listen(port, () => {
                console.log(`Soxy instance listening at http://localhost:${port}/`)
                if(typeof cb === 'function') cb(port)
            })

        }
        return this.instance;
    }

    /**
     * Parse Cookies
     * @param c request.headers.cookie
     * @returns Cookie object
     */
    public static Cookie(c: string) {
        let cookie:any = {};
        if (c) c.toString().split(';').map((cl) =>
            cookie[cl.split('=')[0].trim()] = cl.split('=')[1])
        return cookie;
    }

    /**
     * 
     * @param req Express Request
     * @param cookie Cookie object
     * @param res Express Response. Optional, only for authentication.
     * @returns 
     */
    public static async Session(req: Request, cookie: any, res?: Response) : Promise<Session> {
        if(!cookie.Soxy) {
            const session = await this.database.session.create({
                data: {
                    ip: <string>req.headers['x-forwarded-for'] || req.ip,
                    agent: <string>req.get('user-agent'),
                }
            })
            const signedSesion = sign({ id: session.id }, <string>process.env.SECRET, { expiresIn: '1y' })
            if(res) res.cookie('Soxy', signedSesion, { maxAge: 1000 * 60 * 60 * 24 * 365 })
            return session;
        } else {
            return <Session><unknown>verify(cookie.Soxy, <string>process.env.SECRET, async (error: any, s: any) => {
                if (error) return null;
                const session = await this.database.session.findUnique({ 
                    where: {
                        id: s.id 
                    }
                });
                return session;
            })
        }
    }

    /**
     * Soxy main application
     * @param req  Express Request
     * @param req  Express Response
     * @param next Express NextFunction
     */
    static async app(req: Request, res: Response, next: NextFunction) {
        const cookie = Soxy.Cookie(req?.headers?.cookie?.toString() || '');
        const session = await Soxy.Session(req, cookie, res);
        if(!session) {
            res.cookie('Soxy', '', {maxAge: 0})
            res.redirect('/');
        }

        res.render('../layout/app')  
        
    }
}

export interface Socket extends Client {
    session: Session;
    render: any;
    route: string;
}

export class Router extends EventEmitter2 {

    constructor() { 
        super()
    }

    public static watch(uiPath: string, listener: any) {
        // TODO: Swap fs for chokidar or something else.
        const customListener = async(event: string, filename: string) => {
            if(event === 'change' && typeof listener === 'function' && !fsTimeout) {
                listener(filename.split('.pug')[0]);
                fsTimeout = setTimeout(() => fsTimeout = null, 1000);
            }
        } 
        return fs.watch('./ui/page/'+uiPath, customListener)
    }

    static compiler(file: string, options: any = {}) {
        return pug.compileFile(file, options)
    }

    static async render(route: string, locals?: any, socket?: Socket) {
        let compiler, template = path.join('./ui/page', route + '.pug');
        if(!socket) {
            const sockets : Socket[] =  <unknown>await Soxy.sockets as Socket[];
                for(const socket of sockets) 
                    if(socket?.route === route) socket.emit('redraw');
        } else {
            try {
                compiler = this.compiler(template);
            } catch(error) {
                console.log(`${socket.session.id} encountered an error in ${route}`)
                console.log(error?.stack || error)
                template = path.join('./ui/layout/error.pug');
                compiler  = this.compiler(template);
                locals = { title: `Error`, error: { title: `Failed to render view`, text: error.toString() }}
            } finally {
                return compiler(locals);
            }
        }
    }

}