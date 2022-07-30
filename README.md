# Checkpatch Lint

[Visual Studio Code](https://github.com/Microsoft/vscode) extension for using linux kernel checkpatch tool to lint code.

## Installation

[checkpatch.pl](https://github.com/torvalds/linux/blob/master/scripts/checkpatch.pl) script should be either exposed through $PATH or
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
On windows, a perl interpreter should also be installed - tested with [ActivePerl Community Edition](https://www.activestate.com/products/activeperl/downloads/).  
*.pl files should be configured to be opened by the interpreter by default (double click on any *.pl file and choose ActivePerl as the default program).
GNU 'diff' executable should also be available (can be done by installing [git-for-windows](https://git-scm.com/download/win) and adding it to PATH).

## Commands
* `checkpatch.checkFile` Check selected file (if the run mode is manual)
* `checkpatch.checkCommit` Select specific commit to be tested
* `checkpatch.toggleAutoRun` Toggle automatic checkpatch for the current workspace

## Settings
* `checkpatch.checkpatchPath` Path to the checkpatch.pl script
* `checkpatch.checkpatchArgs` checkpatch arguments to use
* `checkpatch.useFolderAsCwd` Relative to multiroot workspace layout. Whether the linter should run in the workspace where the file is from or use the root workspace
* `checkpatch.run` Control whether the linting is automatic on save or manually triggered using the `checkpatch.checkFile` command.
* `checkpatch.exclude` Glob patterns for excluding files and folders from automatic checks.
* `checkpatch.diagnosticLevel` Diagnostic level of checkpatch errors.
