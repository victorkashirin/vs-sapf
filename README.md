# SAPF support for VS Code

This extension allows to interactively work with sapf REPL. It comes «batteries included», and doesn't rely on
Main features:
- Commands for line, selection and code block evaluation (surrounded by parenthesis)
- Function autocomplete and help on hover (configuration courtesy of [sapf-lsp](https://github.com/vasilymilovidov/sapf-lsp))
- Support for commands `stop`, `clear`, `cleard`, `quit`.


There's another excellent vscode extension for sapf [vscode-sapf](https://github.com/chairbender/vscode-sapf) by chairbender. Main difference is that it relies on extenral lsp-server, which has it benefits, but requires more effort to set up.

Default shortcuts:
- `cmd+enter`: evaluate line or selection
- `shift+enter`: evaluate block, line (if block not found) or selection
- `cmd+.`: stop sound
- `cmd+shift+.`: clear stack

Inspiration:
- [vscode-sapf](https://github.com/chairbender/vscode-sapf)
- [SAPF for NVIM](https://github.com/salkin-mada/sapf.nvim/tree/main)
- [Tidalcycles](https://github.com/tidalcycles/vscode-tidalcycles/tree/main) for VSCode