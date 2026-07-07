fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'wm_rubbellos'
author 'WM Modding'
description 'Rubbellos / Scratchcard mit sicherer serverseitiger Gewinnlogik (ESX / QBCore / Standalone)'
version '1.0.0'

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua'
}

client_scripts {
    'client.lua'
}

server_scripts {
    'server.lua'
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js'
}

dependency 'ox_lib'
