Config = {}

-- ═══════════════════════════════════════════════════════════════
--  FRAMEWORK
--  "esx" | "qb" | "standalone"
-- ═══════════════════════════════════════════════════════════════
Config.Framework = 'esx'

-- ═══════════════════════════════════════════════════════════════
--  ITEM & NUTZUNG
-- ═══════════════════════════════════════════════════════════════
Config.ItemName        = 'rubbellos'   -- Item-Name (ESX / QBCore / ox_inventory usable item)
Config.RemoveItemFirst = true          -- Item wird VOR dem Öffnen serverseitig entfernt
Config.Cooldown        = 10            -- Sekunden Cooldown zwischen zwei Losen (pro Spieler, serverseitig)

-- Inventarsystem: "auto" | "ox" | "framework"
-- auto      = nutzt ox_inventory automatisch, falls gestartet, sonst ESX/QB-Inventar
-- ox        = erzwingt ox_inventory (Item-Verbrauch über server.export, siehe README-Kommentar in server.lua)
-- framework = erzwingt klassisches ESX-/QB-Inventar
Config.Inventory = 'auto'

-- Standalone: Befehl zum Öffnen (nur wenn Framework = "standalone"), false = deaktiviert
Config.StandaloneCommand = 'rubbellos'

-- ═══════════════════════════════════════════════════════════════
--  GEWINNE (nur serverseitig relevant!)
--  chance  = Gewichtung in % (Summe sollte 100 ergeben, wird aber
--            automatisch normalisiert, falls nicht)
--  amount  = Auszahlung in $ (0 = Niete)
--  label   = Anzeige auf dem Rubbelfeld / im Ergebnis
-- ═══════════════════════════════════════════════════════════════
Config.Prizes = {
    -- ca. 28% Gewinnchance insgesamt: selten genug, aber noch fair spielbar.
    { chance = 72, amount = 0,      label = 'NIETE'  },
    { chance = 14, amount = 500,    label = '$500'   },
    { chance = 7,  amount = 2500,   label = '$2.5K'  },
    { chance = 4,  amount = 10000,  label = '$10K'   },
    { chance = 2,  amount = 25000,  label = '$25K'   },
    { chance = 1,  amount = 100000, label = 'JACKPOT' }, -- Jackpot
}

-- Konto für die Auszahlung
-- ESX:  'money' | 'bank' | 'black_money'
-- QB:   'cash'  | 'bank'
Config.PayoutAccount = 'money'

-- ═══════════════════════════════════════════════════════════════
--  RUBBEL-VERHALTEN
-- ═══════════════════════════════════════════════════════════════
Config.ScratchThreshold = 82    -- % eines Feldes, ab dem es automatisch komplett aufgedeckt wird
Config.AllowRevealAll   = true  -- Button "ALLES FREIRUBBELN" anzeigen
Config.Sounds           = true  -- Rubbel-/Gewinn-Sounds in der NUI (ohne externe Dateien)

-- ═══════════════════════════════════════════════════════════════
--  ANIMATION & PROGRESSBAR (vor dem Öffnen)
-- ═══════════════════════════════════════════════════════════════
Config.UseAnimation = false
Config.Animation = {
    dict = 'mp_common',
    anim = 'givetake1_a',
    flag = 49,
}

Config.Progress = {
    enabled  = false,
    duration = 300,                  -- ms, falls Progress wieder aktiviert wird
    label    = 'Rubbellos wird geöffnet...',
    -- Nutzt automatisch ox_lib (falls gestartet), sonst QBCore-Progressbar,
    -- sonst einfache Wartezeit mit Animation.
}

-- ═══════════════════════════════════════════════════════════════
--  TEXTE / LOCALE
-- ═══════════════════════════════════════════════════════════════
Config.Locale = {
    title            = 'RUBBELLOS',
    subtitle         = 'Halte und ziehe zum Freirubbeln',
    brand            = 'Rubbellos',
    prizesButton     = 'Gewinne',
    prizesHeader     = 'Mögliche Gewinne',
    closeButton      = 'Schließen',
    revealAll        = 'ALLES FREIRUBBELN',
    continueButton   = 'WEITER',
    loseTitle        = 'KEIN GEWINN',
    loseSub          = '0$ erhalten',
    loseTagline      = 'Die Legende startet oft mit einer Niete',
    winTitle         = 'GEWONNEN',
    winSub           = '%s erhalten',           -- %s = Gewinn-Label
    winTagline       = 'Das Los hat sich gelohnt!',
    notifyCooldown   = 'Du musst noch %s Sekunden warten.',
    notifyNoItem     = 'Du hast kein Rubbellos.',
    notifyWin        = 'Du hast %s gewonnen!',
    notifyLose       = 'Leider kein Gewinn.',
}

-- ═══════════════════════════════════════════════════════════════
--  NOTIFY
--  Läuft clientseitig über ox_lib.
-- ═══════════════════════════════════════════════════════════════
Config.Notify = function(msg)
    if type(lib) == 'table' and type(lib.notify) == 'function' then
        lib.notify({
            title = 'Rubbellos',
            description = msg,
            type = 'inform',
            position = 'top-right'
        })
        return
    end

    BeginTextCommandThefeedPost('STRING')
    AddTextComponentSubstringPlayerName(msg)
    EndTextCommandThefeedPostTicker(false, false)
end
