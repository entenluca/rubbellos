--[[
    wm_rubbellos • client.lua
    ─────────────────────────────────────────────────────────────
    Der Client ist reine Anzeige:
    • empfängt vom Server nur Anzeige-Daten + Session-Token
    • sendet beim Einlösen NUR das Token zurück
    • entscheidet und kennt keinerlei Auszahlungslogik
]]

local ESX, QBCore = nil, nil
local uiOpen = false
local currentToken = nil

CreateThread(function()
    if Config.Framework == 'esx' then
        ESX = exports['es_extended']:getSharedObject()
    elseif Config.Framework == 'qb' then
        QBCore = exports['qb-core']:GetCoreObject()
    end
end)

-- ═══════════════════════════════════════════════════════════════
--  NOTIFY (vom Server getriggert)
-- ═══════════════════════════════════════════════════════════════

RegisterNetEvent('wm_rubbellos:notify', function(msg)
    Config.Notify(msg)
end)

-- ═══════════════════════════════════════════════════════════════
--  ANIMATION & PROGRESSBAR
-- ═══════════════════════════════════════════════════════════════

local function playUseAnimation()
    if not Config.UseAnimation then return end
    local ped = PlayerPedId()
    RequestAnimDict(Config.Animation.dict)
    local timeout = GetGameTimer() + 3000
    while not HasAnimDictLoaded(Config.Animation.dict) and GetGameTimer() < timeout do
        Wait(10)
    end
    TaskPlayAnim(ped, Config.Animation.dict, Config.Animation.anim,
        8.0, -8.0, Config.Progress.enabled and Config.Progress.duration or 1500,
        Config.Animation.flag, 0, false, false, false)
end

local function stopUseAnimation()
    if not Config.UseAnimation then return end
    StopAnimTask(PlayerPedId(), Config.Animation.dict, Config.Animation.anim, 1.0)
end

-- Progressbar: ox_lib -> QBCore -> einfache Wartezeit
local function runProgress()
    if not Config.Progress.enabled then return true end

    if GetResourceState('ox_lib') == 'started' and type(lib) == 'table' and type(lib.progressBar) == 'function' then
        return lib.progressBar({
            duration = Config.Progress.duration,
            label = Config.Progress.label,
            useWhileDead = false,
            canCancel = true,
            disable = { move = true, car = true, combat = true },
        })
    end

    if Config.Framework == 'qb' and QBCore then
        local done, ok = false, false
        QBCore.Functions.Progressbar('wm_rubbellos_open', Config.Progress.label,
            Config.Progress.duration, false, true,
            { disableMovement = true, disableCarMovement = true, disableCombat = true }, {}, {}, {},
            function() done, ok = true, true end,   -- fertig
            function() done, ok = true, false end)  -- abgebrochen
        while not done do Wait(50) end
        return ok
    end

    -- Fallback: einfache Wartezeit mit Animation
    Wait(Config.Progress.duration)
    return true
end

-- ═══════════════════════════════════════════════════════════════
--  UI ÖFFNEN (Server hat Item bereits geprüft & entfernt)
-- ═══════════════════════════════════════════════════════════════

local function closeUi()
    if not uiOpen then return end
    uiOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'hide' })
end

RegisterNetEvent('wm_rubbellos:open', function(data)
    if uiOpen then return end

    playUseAnimation()
    local ok = runProgress()
    stopUseAnimation()

    if not ok then
        -- Progressbar abgebrochen -> Gewinn trotzdem einlösen,
        -- damit das (bereits entfernte) Los nicht verloren geht.
        TriggerServerEvent('wm_rubbellos:claim', data.token)
        return
    end

    currentToken = data.token
    uiOpen = true
    SetNuiFocus(true, true)

    SendNUIMessage({
        action = 'show',
        win    = data.win,
        label  = data.label,
        fields = data.fields,
        config = {
            threshold = Config.ScratchThreshold,
            revealAll = Config.AllowRevealAll,
            sounds    = Config.Sounds,
            locale    = Config.Locale,
            prizes    = Config.Prizes, -- nur Labels/Chancen für "Gewinne"-Panel
        },
    })
end)

-- ═══════════════════════════════════════════════════════════════
--  NUI CALLBACKS
-- ═══════════════════════════════════════════════════════════════

-- "WEITER" oder Schließen NACH dem Aufdecken -> Gewinn einlösen
RegisterNUICallback('claim', function(_, cb)
    if currentToken then
        TriggerServerEvent('wm_rubbellos:claim', currentToken)
        currentToken = nil
    end
    closeUi()
    cb('ok')
end)

-- Schließen (ESC / Button) – auch hier wird eingelöst, damit ein
-- bereits gezogenes Los nie verfällt.
RegisterNUICallback('close', function(_, cb)
    if currentToken then
        TriggerServerEvent('wm_rubbellos:claim', currentToken)
        currentToken = nil
    end
    closeUi()
    cb('ok')
end)

-- ═══════════════════════════════════════════════════════════════
--  SAFETY: Fokus lösen, falls Resource neu startet
-- ═══════════════════════════════════════════════════════════════

AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() then
        SetNuiFocus(false, false)
    end
end)
