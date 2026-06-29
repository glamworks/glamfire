# VHS tape — records a real terminal demo GIF of the glam CLI.
# Install: https://github.com/charmbracelet/vhs   then:  vhs marketing/assets/demo.tape
# Output: marketing/assets/demo.gif  (drives the REAL CLI — no fake output)

Output marketing/assets/demo.gif

Set FontSize 20
Set Width 1200
Set Height 600
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms

# Make `glam` resolve to the real CLI from the repo root (hidden from the recording).
Hide
Type "alias glam='node packages/cli/src/index.mjs' && clear"
Enter
Show

Type "glam --version"
Sleep 400ms
Enter
Sleep 800ms

Type "glam help"
Sleep 400ms
Enter
Sleep 2s

Type "glam doctor"
Sleep 400ms
Enter
Sleep 2500ms
