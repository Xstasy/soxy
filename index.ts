require('dotenv').config()
import { Soxy } from './Soxy'

Soxy.listen(1337, async() => {
    const { router, webserver } = Soxy
        
    router.on('/', async(client) => {
        client.render('/', { title: 'Dashboard' })
    })
});
