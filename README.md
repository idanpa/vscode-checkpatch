# Checkpatch Lint

[Visual Studio Code](https://github.com/Microsoft/vscode) extension for using linux kernel checkpatch tool to lint code.

## Installation

checkpatch.pl script should be installed on your machine. It should be either exposed through $PATH or
pointed out by the `checkpatch.checkpatchPath` configuration.
You can download the checkpatch script from the latest linux kernel by:
  ```bash
	KERNEL_RAW_URL="https://raw.githubusercontent.com/torvalds/linux/master"
	sudo wget -O /usr/bin/checkpatch.pl "${KERNEL_RAW_URL}/scripts/checkpatch.pl"
	sudo wget -O /usr/bin/spelling.txt "${KERNEL_RAW_URL}/scripts/spelling.txt"
	sudo chmod 755 /usr/bin/checkpatch.pl
  ```

### Windows users

Beside the above - a perl interpreter should also be installed. Tested successfully with [ActivePerl Community Edition](https://www.activestate.com/products/activeperl/downloads/).
*.pl files should be configured to be opened by the interpreter.
GNU 'diff' executable should also be available (can be done by installing git-for-windows and adding it to PATH).
Out-of-the-box WSL support is waiting for this issue - [#63155](https://github.com/Microsoft/vscode/issues/63155).

## Usage

Either have checkpatch.pl available in PATH, or set `checkpatch.checkpatchPath` configuration to your checkpatch.pl path.
Use `checkpatch.checkpatchArgs` to add arguments such as `--ignore BLOCK_COMMENT_STYLE`, `--max-line-length=120`
