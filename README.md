# Checkpatch Lint

[Visual Studio Code](https://github.com/Microsoft/vscode) extension for using linux kernel checkpatch tool to lint code.

## Installation

[checkpatch.pl](https://github.com/torvalds/linux/blob/master/scripts/checkpatch.pl) script should be installed on your machine. It should be either exposed through $PATH or
pointed out by the `checkpatch.checkpatchPath` configuration.
You can download the checkpatch script from the latest linux kernel by (bash):
  ```bash
sudo wget -O /usr/bin/checkpatch.pl "https://raw.githubusercontent.com/torvalds/linux/master/scripts/checkpatch.pl"
sudo wget -O /usr/bin/spelling.txt "https://raw.githubusercontent.com/torvalds/linux/master/scripts/spelling.txt"
sudo chmod 755 /usr/bin/checkpatch.pl
  ```

### Windows users

Downloading checkpatch script (cmd as administrator):
  ```bash
curl -o %WINDIR%/System32/checkpatch.pl "https://raw.githubusercontent.com/torvalds/linux/master/scripts/checkpatch.pl"
curl -o %WINDIR%/System32/spelling.txt "https://raw.githubusercontent.com/torvalds/linux/master/scripts/spelling.txt"
  ```
Additionally, a perl interpreter should also be installed - tested with [ActivePerl Community Edition](https://www.activestate.com/products/activeperl/downloads/).  
*.pl files should be configured to be opened by the interpreter by default (double click on any *.pl file and choose ActivePerl as the default program).
GNU 'diff' executable should also be available (can be done by installing [git-for-windows](https://git-scm.com/download/win) and adding it to PATH).  
Out-of-the-box WSL support is waiting for this issue - [#63155](https://github.com/Microsoft/vscode/issues/63155).

## Usage

Either have checkpatch.pl available in PATH, or set `checkpatch.checkpatchPath` configuration to your checkpatch.pl path.
Use `checkpatch.checkpatchArgs` to add arguments such as `--ignore BLOCK_COMMENT_STYLE`, `--max-line-length=120`  
`checkpatch.run` configuration controls whether the liniting is automatic or manually triggered using the `checkpatch.checkFile` command.
