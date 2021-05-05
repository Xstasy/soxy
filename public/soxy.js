const socket = io();
let firstRender = true;

const navigate = (path) => {
    path = path ? path : window.location.hash?.substr(2)
    path = path.length !== 0 ? path : '/'
    console.log(path)
    socket.emit('soxy:navigate', path);
}

socket.on('redraw', () => {
    console.log(`should redraw ${history.state.path}`)
    navigate('/' + history?.state?.path)
})

socket.on('refresh', (p) => {
    if(p) window.location.href = p
    else location.reload();
})

socket.render = (path, html, locals) => {

    const renderState = {
        path: path,
        title: `Soxy » ${locals?.title}` || null,
        html: html,
    }
    if(path === '/') renderState.path = '';
    if(firstRender)
        history.replaceState(renderState, renderState.title, '/#!/' + renderState.path)
    else
        history.pushState(renderState, renderState.title, '#!/' + renderState.path)
    firstRender = false

    document.title = renderState.title;
    $('#app').html(renderState.html)
    if(typeof activateLinks === 'function') activateLinks();
    
} 

socket.on('die', () => window.location.href = '/logout')
socket.on('render', socket.render)

socket.on('connect', () => {
    navigate();
})

window.addEventListener("popstate", function(e) {
    if (e && e.state && e.state.html) {
        document.title = e.state.title;
        $('#app').html(e.state.html)
    }
});

const activateLinks = function() { 
    $('#app').click(function() {

        const target = $(this).attr('target')
        const href = $(this).attr('href')

        if(target !== '_blank') {
            console.log(href)
            return navigate($(this).attr('href').substr(2))
        }
    })
}

$(() => {
    $('a').click(function(e) {
        const target = $(this).attr('target')
        const href = $(this).attr('href')
        if(target !== '_blank') {
            return navigate($(this).attr('href').substr(2))
        }
    })
})