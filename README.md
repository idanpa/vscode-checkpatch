# Checkpatch Lint

[Visual Studio Code](https://github.com/Microsoft/vscode) extension for using linux kernel checkpatch tool to lint code.

## Installation

[checkpatch.pl](https://github.com/torvalds/linux/blob/master/scripts/checkpatch.pl) script should be installed on your machine. It should be either exposed through $PATH or
pointed out by the `checkpatch.checkpatchPath` configuration.

### Linux / [WSL Remote Development](https://code.visualstudio.com/docs/remote/wsl)
  ```bash
sudo wget -O /usr/bin/checkpatch.pl "https://raw.githubusercontent.com/torvalds/linux/master/scripts/checkpatch.pl"
sudo wget -O /usr/bin/spelling.txt "https://raw.githubusercontent.com/torvalds/linux/master/scripts/spelling.txt"
sudo chmod 755 /usr/bin/checkpatch.pl
  ```


### Windows

cmd as administrator:
  ```bash
curl -o %WINDIR%/System32/checkpatch.pl "https://raw.githubusercontent.com/torvalds/linux/master/scripts/checkpatch.pl"
curl -o %WINDIR%/System32/spelling.txt "https://raw.githubusercontent.com/torvalds/linux/master/scripts/spelling.txt"
  ```
Additionally, a perl interpreter should also be installed - tested with [ActivePerl Community Edition](https://www.activestate.com/products/activeperl/downloads/).  
*.pl files should be configured to be opened by the interpreter by default (double click on any *.pl file and choose ActivePerl as the default program).
GNU 'diff' executable should also be available (can be done by installing [git-for-windows](https://git-scm.com/download/win) and adding it to PATH).

## Commands
* `checkpatch.checkFile` checks selected file (if the run mode is manual)
* `checkpatch.checkCommit` select specific commit to be tested

## settings.json
* `checkpatch.checkpatchArgs` let you add arguments such as `--ignore BLOCK_COMMENT_STYLE`, `--max-line-length=120`  
* `checkpatch.run` controls whether the liniting is automatic or manually triggered using the `checkpatch.checkFile` command.
