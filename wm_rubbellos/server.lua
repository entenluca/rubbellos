--[[
    wm_rubbellos • server.lua
    ─────────────────────────────────────────────────────────────
    SICHERHEITSKONZEPT
    • Der Server würfelt den Gewinn – der Client bekommt nur das
      fertige Ergebnis (Anzeige-Daten) + ein zufälliges Session-Token.
    • Auszahlung erfolgt AUSSCHLIESSLICH über das serverseitig
      gespeicherte Session-Objekt. Client-Events enthalten NIE einen
      Geldbetrag.
    • Item-Prüfung & Item-Entfernung passieren nur serverseitig.
    • Doppelte Auszahlung unmöglich: Session wird beim Claim gelöscht.
    • Cooldown + Event-Rate-Limit pro Spieler.
    • Nicht eingelöste Gewinne werden bei Timeout/Disconnect
      automatisch ausgezahlt (kein Verlust durch Crash).
]]

local ESX, QBCore = nil, nil

if Config.Framework == 'esx' then
    ESX = exports['es_extended']:getSharedObject()
elseif Config.Framework == 'qb' then
    QBCore = exports['qb-core']:GetCoreObject()
end

-- ═══════════════════════════════════════════════════════════════
--  STATE
-- ═══════════════════════════════════════════════════════════════
local sessions  = {}   -- [source] = { token, amount, label, created }
local cooldowns = {}   -- [identifier] = os.time() bis Cooldown-Ende
local lastEvent = {}   -- [source] = os.clock() (Anti-Spam für Events)

local SESSION_TIMEOUT = 300 -- Sekunden, danach Auto-Auszahlung + Aufräumen

-- ═══════════════════════════════════════════════════════════════
--  HELPER
-- ═══════════════════════════════════════════════════════════════

local function getIdentifier(src)
    if Config.Framework == 'esx' then
        local xPlayer = ESX.GetPlayerFromId(src)
        return xPlayer and xPlayer.identifier or nil
    elseif Config.Framework == 'qb' then
        local Player = QBCore.Functions.GetPlayer(src)
        return Player and Player.PlayerData.citizenid or nil
    end
    -- Standalone: Lizenz als Identifier
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    return ('src:%s'):format(src)
end

local function notify(src, msg)
    TriggerClientEvent('wm_rubbellos:notify', src, msg)
end

-- Einfaches Rate-Limit: max. 1 sicherheitsrelevantes Event / 500 ms
local function rateLimited(src)
    local now = os.clock()
    if lastEvent[src] and (now - lastEvent[src]) < 0.5 then
        return true
    end
    lastEvent[src] = now
    return false
end

local function randomToken()
    local chars, t = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', {}
    for i = 1, 24 do
        local r = math.random(1, #chars)
        t[i] = chars:sub(r, r)
    end
    return table.concat(t)
end

-- ═══════════════════════════════════════════════════════════════
--  GEWINN-LOGIK
-- ═══════════════════════════════════════════════════════════════

-- Gewichteten Zufallsgewinn aus Config.Prizes ziehen
local function rollPrize()
    local total = 0
    for _, p in ipairs(Config.Prizes) do total = total + p.chance end

    local roll, acc = math.random() * total, 0
    for _, p in ipairs(Config.Prizes) do
        acc = acc + p.chance
        if roll <= acc then return p end
    end
    return Config.Prizes[1] -- Fallback (sollte nie eintreten)
end

--[[
    6 Anzeige-Werte für die Rubbelfelder erzeugen.
    Klassische Los-Logik: 3× gleicher Wert = Gewinn.
    • Gewinn:  Gewinn-Label exakt 3× + Füller (jeweils max. 2×)
    • Niete:   kein Label erscheint 3×
    Die Felder sind reine Optik – die Auszahlung hängt nur am
    serverseitigen Session-Objekt.
]]
local function buildFields(prize)
    local pool = {}
    for _, p in ipairs(Config.Prizes) do
        if p.amount > 0 then pool[#pool + 1] = p.label end
    end

    local fields, counts = {}, {}
    local isWin = prize.amount > 0

    if isWin then
        for i = 1, 3 do fields[#fields + 1] = prize.label end
        counts[prize.label] = 3
    end

    if #pool == 0 then pool = { 'NIETE' } end -- Fallback bei ungewöhnlicher Config

    local attempts = 0
    while #fields < 6 do
        attempts = attempts + 1
        local label = pool[math.random(#pool)]
        local c = counts[label] or 0
        local maxAllowed = (isWin and label == prize.label) and 3 or 2
        if c < maxAllowed or attempts > 200 then -- Guard: nie endlos hängen
            fields[#fields + 1] = label
            counts[label] = c + 1
        end
    end

    -- Fisher-Yates-Shuffle
    for i = #fields, 2, -1 do
        local j = math.random(i)
        fields[i], fields[j] = fields[j], fields[i]
    end

    return fields
end

-- ═══════════════════════════════════════════════════════════════
--  AUSZAHLUNG
-- ═══════════════════════════════════════════════════════════════

local function payout(src, amount)
    if amount <= 0 then return true end

    if Config.Framework == 'esx' then
        local xPlayer = ESX.GetPlayerFromId(src)
        if not xPlayer then return false end
        xPlayer.addAccountMoney(Config.PayoutAccount, amount)
        return true
    elseif Config.Framework == 'qb' then
        local Player = QBCore.Functions.GetPlayer(src)
        if not Player then return false end
        Player.Functions.AddMoney(Config.PayoutAccount, amount, 'wm_rubbellos win')
        return true
    end

    -- Standalone: hier eigene Geld-Logik einhängen
    TriggerEvent('wm_rubbellos:standalonePayout', src, amount)
    print(('[wm_rubbellos] Standalone-Auszahlung: %s -> $%s'):format(src, amount))
    return true
end

-- Session abschließen (Claim, Timeout oder Disconnect)
local function settleSession(src, silent)
    local s = sessions[src]
    if not s then return end
    sessions[src] = nil -- Zuerst löschen -> doppelte Auszahlung unmöglich

    if s.amount > 0 then
        if payout(src, s.amount) and not silent then
            notify(src, Config.Locale.notifyWin:format(s.label))
        end
    elseif not silent then
        notify(src, Config.Locale.notifyLose)
    end
end

-- ═══════════════════════════════════════════════════════════════
--  ITEM-PRÜFUNG & -ENTFERNUNG (nur serverseitig!)
-- ═══════════════════════════════════════════════════════════════

-- ox_inventory aktiv?
local function usingOx()
    if Config.Inventory == 'ox' then return true end
    if Config.Inventory == 'framework' then return false end
    return GetResourceState('ox_inventory') == 'started' -- "auto"
end

local function takeItem(src)
    -- ox_inventory: Prüfung & Entfernung direkt über ox-Exports
    if usingOx() then
        local count = exports.ox_inventory:Search(src, 'count', Config.ItemName)
        if not count or count < 1 then return false end
        return exports.ox_inventory:RemoveItem(src, Config.ItemName, 1) == true
    end

    if Config.Framework == 'esx' then
        local xPlayer = ESX.GetPlayerFromId(src)
        if not xPlayer then return false end
        local item = xPlayer.getInventoryItem(Config.ItemName)
        if not item or item.count < 1 then return false end
        xPlayer.removeInventoryItem(Config.ItemName, 1)
        return true
    elseif Config.Framework == 'qb' then
        local Player = QBCore.Functions.GetPlayer(src)
        if not Player then return false end
        local item = Player.Functions.GetItemByName(Config.ItemName)
        if not item or item.amount < 1 then return false end
        Player.Functions.RemoveItem(Config.ItemName, 1)
        TriggerClientEvent('inventory:client:ItemBox', src, QBCore.Shared.Items[Config.ItemName], 'remove')
        return true
    end
    return true -- Standalone: kein Inventar -> immer erlaubt
end

-- ═══════════════════════════════════════════════════════════════
--  LOS STARTEN
-- ═══════════════════════════════════════════════════════════════

-- skipItem = true, wenn das Item bereits entfernt wurde
-- (z. B. ox_inventory-consume) oder gar kein Item nötig ist (Export/give)
local function startScratchcard(src, skipItem)
    if rateLimited(src) then return end

    -- Bereits eine offene Session? -> blocken (Anti-Exploit)
    if sessions[src] then return end

    local identifier = getIdentifier(src)
    if not identifier then return end

    -- Cooldown prüfen
    local now = os.time()
    if cooldowns[identifier] and cooldowns[identifier] > now then
        notify(src, Config.Locale.notifyCooldown:format(cooldowns[identifier] - now))
        return
    end

    -- Item serverseitig prüfen & entfernen
    if not skipItem and not takeItem(src) then
        notify(src, Config.Locale.notifyNoItem)
        return
    end

    cooldowns[identifier] = now + Config.Cooldown

    -- Gewinn serverseitig würfeln
    local prize  = rollPrize()
    local token  = randomToken()
    local fields = buildFields(prize)

    sessions[src] = {
        token   = token,
        amount  = prize.amount,
        label   = prize.label,
        created = now,
    }

    -- Nur Anzeige-Daten + Token an den Client (kein manipulierbarer Betrag)
    TriggerClientEvent('wm_rubbellos:open', src, {
        token  = token,
        win    = prize.amount > 0,
        label  = prize.label,
        fields = fields,
    })
end

-- ═══════════════════════════════════════════════════════════════
--  USABLE ITEM REGISTRIEREN
--
--  ox_inventory: Das Item wird über einen server.export verbraucht.
--  Eintrag in ox_inventory/data/items.lua:
--
--  ['rubbellos'] = {
--      label = 'Rubbellos',
--      weight = 10,
--      stack = true,
--      close = true,
--      consume = 1,                                   -- ox entfernt das Item selbst
--      description = 'Rubbeln und gewinnen!',
--      server = { export = 'wm_rubbellos.rubbellos' } -- Resourcename.ItemName
--  }
-- ═══════════════════════════════════════════════════════════════

-- ox_inventory-Export: wird beim Benutzen des Items von ox aufgerufen
-- 'usingItem'  -> vor dem Verbrauch (return false = abbrechen, Item bleibt)
-- 'usedItem'   -> nach dem Verbrauch -> Los starten (skipItem, ox hat entfernt)
exports(Config.ItemName, function(event, item, inventory)
    if not usingOx() then return end
    local src = inventory.id

    if event == 'usingItem' then
        -- Cooldown/Session VOR dem Verbrauch prüfen, damit kein Los verfällt
        if sessions[src] then return false end
        local identifier = getIdentifier(src)
        local now = os.time()
        if identifier and cooldowns[identifier] and cooldowns[identifier] > now then
            notify(src, Config.Locale.notifyCooldown:format(cooldowns[identifier] - now))
            return false
        end
    elseif event == 'usedItem' then
        startScratchcard(src, true) -- Item wurde bereits durch ox konsumiert
    end
end)

CreateThread(function()
    math.randomseed(os.time())

    -- Standalone-Command unabhängig vom Inventarsystem
    if Config.Framework == 'standalone' and Config.StandaloneCommand then
        RegisterCommand(Config.StandaloneCommand, function(src)
            if src > 0 then startScratchcard(src) end
        end, false)
    end

    -- Klassische Usable-Item-Registrierung nur ohne ox_inventory
    -- (mit ox läuft alles über den server.export oben)
    if usingOx() then
        print(('[wm_rubbellos] ox_inventory erkannt – Item "%s" läuft über server.export "%s.%s"')
            :format(Config.ItemName, GetCurrentResourceName(), Config.ItemName))
        return
    end

    if Config.Framework == 'esx' then
        ESX.RegisterUsableItem(Config.ItemName, function(src)
            startScratchcard(src)
        end)
    elseif Config.Framework == 'qb' then
        QBCore.Functions.CreateUseableItem(Config.ItemName, function(src)
            startScratchcard(src)
        end)
    end
end)

-- Manuelles Öffnen durch andere Resources (nur serverseitig!)
-- Beispiel: TriggerEvent('wm_rubbellos:give', playerId)
-- Bewusst KEIN RegisterNetEvent -> Clients können dieses Event nicht auslösen.
AddEventHandler('wm_rubbellos:give', function(target)
    if target then startScratchcard(target) end
end)

exports('OpenScratchcard', function(target)
    if target then startScratchcard(target) end
end)

-- ═══════════════════════════════════════════════════════════════
--  CLAIM (WEITER / Schließen nach Aufdecken)
--  Client sendet NUR das Token – niemals einen Betrag.
-- ═══════════════════════════════════════════════════════════════

RegisterNetEvent('wm_rubbellos:claim', function(token)
    local src = source
    if rateLimited(src) then return end

    local s = sessions[src]
    -- Token muss zur serverseitigen Session passen (Schutz vor NUI-Manipulation)
    if not s or type(token) ~= 'string' or s.token ~= token then
        return
    end

    settleSession(src, false)
end)

-- ═══════════════════════════════════════════════════════════════
--  AUFRÄUMEN: Disconnect & Timeout -> Gewinn geht nicht verloren
-- ═══════════════════════════════════════════════════════════════

AddEventHandler('playerDropped', function()
    local src = source
    settleSession(src, true) -- still auszahlen, keine Notify möglich
    lastEvent[src] = nil
end)

CreateThread(function()
    while true do
        Wait(60000)
        local now = os.time()
        for src, s in pairs(sessions) do
            if (now - s.created) > SESSION_TIMEOUT then
                settleSession(src, true)
            end
        end
    end
end)
