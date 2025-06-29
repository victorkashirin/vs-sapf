# SAPF Support for VS Code

This extension provides interactive support for working with the [sapf](https://github.com/lfnoise/sapf/) REPL. It comes "batteries included" and does not rely on any external setup.

### Features

* Commands for evaluating the current line, selection, or code block (surrounded by parentheses)
* Function autocompletion and hover-based documentation (powered by config from [sapf-lsp](https://github.com/vasilymilovidov/sapf-lsp))
* Built-in support for `stop`, `clear`, `cleard`, and `quit` commands
* Support for a custom prelude file

There is also an excellent VS Code extension for `sapf` by [chairbender](https://github.com/chairbender/vscode-sapf). The main difference is that it relies on an external LSP server. While this approach has its benefits, it requires more setup effort.

### Default Shortcuts

* `Cmd+Enter`: Evaluate the current line or selection
* `Shift+Enter`: Evaluate the current block, or the line/selection if no block is found
* `Cmd+.`: Stop sound
* `Cmd+Shift+.`: Clear the stack

### Inspiration

* [vscode-sapf](https://github.com/chairbender/vscode-sapf)
* [SAPF for NVIM](https://github.com/salkin-mada/sapf.nvim/tree/main)
* [TidalCycles for VS Code](https://github.com/tidalcycles/vscode-tidalcycles/tree/main)
