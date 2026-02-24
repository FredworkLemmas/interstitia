#!/bin/bash
name=$(grep -oP '"Id":\s*"[^"]*' ./metadata.json | grep -oP '[^"]*$')
kpackagetool6 --type=KWin/Script --remove "$name" 2>/dev/null
kpackagetool6 --type=KWin/Script --install .
kwriteconfig6 --file kwinrc --group Plugins --key "$name"Enabled true

# Force KWin to reload the script
qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$name"
qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$(pwd)/contents/code/main.js" "$name"
qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.start
qdbus org.kde.KWin /KWin reconfigure
