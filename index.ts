require('dotenv').config()
import { Soxy } from './Soxy'

Soxy.listen(1337, async() => {
    const { router } = Soxy

    router.on('/', async(client) => {
        client.render('/', { title: 'Dashboard' })
    })

    router.on('/about', async(client) => {
        client.render('about', { title: 'About' })
    })
    
});