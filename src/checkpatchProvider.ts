'use strict';
import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import * as minimatch from 'minimatch';
import { GitExtension, API as GitAPI, Repository, } from './typings/git';

export interface CommonLinterConfig {
	path: string;
	args: string[];
	excludeGlobs: string[];
	useAsCwd: boolean;
	diagnosticSeverity: vscode.DiagnosticSeverity;
}

export interface FolderLinterConfig {
	path: string | undefined;
	args: string[] | undefined;
	excludeGlobs: string[] | undefined;
	useAsCwd: boolean | undefined;
}

interface RepoPickItem extends vscode.QuickPickItem {
	repo: Repository;
}

const diagSeverityMap = new Map<string, vscode.DiagnosticSeverity>([
    ['Error', vscode.DiagnosticSeverity.Error],
    ['Warning', vscode.DiagnosticSeverity.Warning],
    ['Information', vscode.DiagnosticSeverity.Information],
    ['Hint', vscode.DiagnosticSeverity.Hint],
]);

export default class CheckpatchProvider implements vscode.CodeActionProvider {
	private isConfigured: boolean = false;
	private commonLinterConfig!: CommonLinterConfig;
	private folderLinterConfigs: { [folderPath: string]: FolderLinterConfig } = {};
	private documentListener!: vscode.Disposable;
	private diagnosticCollection = vscode.languages.createDiagnosticCollection('checkpatch');
	private git!: GitAPI;
	private outputChannel: vscode.OutputChannel | undefined;

	private log(value: string): void {
		this.outputChannel?.appendLine(value);
	}

	private prettify(value: string | string[] | undefined): string | undefined {
		let result = undefined;

		if (value) {
			if (!Array.isArray(value)) {
				result = '"' + value + '"';
			} else {
				result = '[';
				for (let s of value) {
					if (result != '[') {
						result += ', ';
					}
					result += this.prettify(s);
				}
				result += ']';
			}
		}

		return result;
	}

	public activate(subscriptions: vscode.Disposable[]) {
		if (!this.outputChannel) {
			this.outputChannel = vscode.window.createOutputChannel('Checkpatch');
		}

		subscriptions.push(this);
		vscode.workspace.onDidCloseTextDocument((textDocument) => {
			// FIXME: this is the wrong event, happening only when removed from cache
			this.diagnosticCollection.delete(textDocument.uri);
		}, null, subscriptions);

		vscode.workspace.onDidChangeConfiguration(this.loadConfig, this, subscriptions);
		this.loadConfig();

		const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')!.exports;
		this.git = gitExtension.getAPI(1);

		vscode.commands.registerCommand('checkpatch.checkFile', () => {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				this.checkpatchFile(editor.document);
			}
		});

		vscode.commands.registerCommand('checkpatch.checkCommit', async () => await this.checkpatchCommit());

		vscode.commands.registerCommand('checkpatch.toggleAutoRun', () => {
			const config = vscode.workspace.getConfiguration('checkpatch');
			config.update('run',
				(config.run === 'onSave') ? 'manual' : 'onSave',
				vscode.ConfigurationTarget.Workspace);
		});

		vscode.commands.registerCommand('checkpatch.cleanDiagnostic', () => this.diagnosticCollection.clear());
	}

	private maybeConfigure(): string {
		if (!this.isConfigured) {
			this.loadConfig();
		}

		if (!this.isConfigured) {
			return 'fail';
		}

		return 'ok';
	}

	private testConfig(description: string, linterPath: string, args: string[], cwd: string | undefined): string {
		this.log(`Test ${description}`);

		var re = /total: \d* errors, \d* warnings,( \d* checks,)? \d* lines checked/g;

		args.push('--no-tree - ');

		let childProcess = cp.spawnSync(linterPath, args, {shell: true, input: ' ', cwd: cwd});
		if (childProcess.pid && childProcess.stdout && re.test(childProcess.stdout.toString())) {
			return 'ok';
		}

		this.log(
			`Test ${description}: probably bad or unusable config. Failed to call "${linterPath}" to test for it works` +
			`${childProcess.stderr ? '. Stderr: "' + childProcess.stderr.toString().trim() + '"' : ''}`
		);
		vscode.window.showErrorMessage(`Checkpatch [config]: Probably bad or unusable config. Please, review the output pane for details`);

		return 'fail';
	}

	private loadConfig(): void {
		this.isConfigured = false;

		if (this.documentListener) {
			this.documentListener.dispose();
		}
		this.diagnosticCollection.clear();

		const commonConfig = vscode.workspace.getConfiguration('checkpatch');

		this.commonLinterConfig = {
			path: commonConfig.checkpatchPath,
			args: commonConfig.checkpatchArgs,
			excludeGlobs: commonConfig.exclude,
			useAsCwd: commonConfig.useFolderAsCwd,
			diagnosticSeverity: diagSeverityMap.get(commonConfig.diagnosticLevel) ?? vscode.DiagnosticSeverity.Information
		};

		let relativePathMessage = '';

		// make path absolute if needed and possible. Relative form may impact when cwd is changed
		if (!path.isAbsolute(this.commonLinterConfig.path) && vscode.workspace.workspaceFolders) {
			this.commonLinterConfig.path = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, this.commonLinterConfig.path);
			relativePathMessage = ' (converted to absolute using root folder path)';
		}

		this.log(
			`Load common config:\n` +
			`  - checkpatchPath:  ${this.prettify(this.commonLinterConfig.path) + relativePathMessage}\n` +
			`  - checkpatchArgs:  ${this.prettify(this.commonLinterConfig.args)}\n` +
			`  - exclude:         ${this.prettify(this.commonLinterConfig.excludeGlobs)}\n` +
			`  - useFolderAsCwd:  ${this.commonLinterConfig.useAsCwd}\n` +
			`  - diagnosticLevel: ${commonConfig.diagnosticLevel}`
		);

		// get folder config(-s)
		this.folderLinterConfigs = {};
		if (vscode.workspace.workspaceFolders) {
			for (let folder of vscode.workspace.workspaceFolders) {
				const folderConfig = vscode.workspace.getConfiguration('checkpatch', folder);
				const pathInspection = folderConfig.inspect<string>('checkpatchPath');
				const argsInspection = folderConfig.inspect<string[]>('checkpatchArgs');
				const excludeInspection = folderConfig.inspect<string[]>('exclude');
				const cwdInspection = folderConfig.inspect<boolean>('useFolderAsCwd');

				let folderLinterConfig: FolderLinterConfig = {
					path: pathInspection?.workspaceFolderValue,
					args: argsInspection?.workspaceFolderValue,
					excludeGlobs: excludeInspection?.workspaceFolderValue,
					useAsCwd: cwdInspection?.workspaceFolderValue
				};

				if (folderLinterConfig.path && !path.isAbsolute(folderLinterConfig.path)) {
					folderLinterConfig.path = path.join(folder.uri.fsPath, folderLinterConfig.path);
					relativePathMessage = ' (converted to absolute)';
				} else {
					relativePathMessage = '';
				}

				this.log(
					`Load folder config @ "${folder.uri.fsPath}":\n` +
					`  - checkpatchPath: ${this.prettify(folderLinterConfig.path) + relativePathMessage}\n` +
					`  - checkpatchArgs: ${this.prettify(folderLinterConfig.args)}\n` +
					`  - exclude:        ${this.prettify(folderLinterConfig.excludeGlobs)}\n` +
					`  - useFolderAsCwd: ${folderLinterConfig.useAsCwd}`
				);

				this.folderLinterConfigs[folder.uri.fsPath] = folderLinterConfig;
			}
		}

		// test config(-s)
		if ('ok' != this.testConfig(
			`common config`,
			this.commonLinterConfig.path,
			this.commonLinterConfig.args.slice(),
			vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined
		)) {
			this.log(`Not configured!`);
			return;
		}
		for (const [folderPath, folderLinterConfig] of Object.entries(this.folderLinterConfigs)) {
			if ('ok' != this.testConfig(
				`folder config @ "${folderPath}"`,
				folderLinterConfig.path ?? this.commonLinterConfig.path,
				(folderLinterConfig.args ?? this.commonLinterConfig.args).slice(),
				(folderLinterConfig.path || folderLinterConfig.useAsCwd || this.commonLinterConfig.useAsCwd) ? folderPath : vscode.workspace.workspaceFolders?.[0].uri.fsPath
			)) {
				this.log(`Not configured!`);
				return;
			}
		}

		if (commonConfig.run === 'onSave') {
			this.documentListener = vscode.workspace.onDidSaveTextDocument(this.checkpatchFile, this);
		}

		this.log(`Configured`);

		this.isConfigured = true;
	}

	public dispose(): void {
		this.diagnosticCollection.clear();
		this.diagnosticCollection.dispose();
	}

	private parseCheckpatchLog(log: string, basePath: string): number {
		const dictionary: { [fileUri: string]: vscode.Diagnostic[] } = {};
		var re = /(.*):(\d+): (WARNING|ERROR|CHECK): ?(.+):(.+)/g;
		var matches;
		let numError = 0;

		while (matches = re.exec(log)) {
			let fileName = matches[1];
			let errorline = parseInt(matches[2]);
			let type = matches[4];
			let message = matches[5];
			let range = new vscode.Range(errorline - 1, 0, errorline - 1, Number.MAX_VALUE);
			let diagnostic = new vscode.Diagnostic(range, `${type}:${message}`, this.commonLinterConfig.diagnosticSeverity);

			diagnostic.code = type;
			diagnostic.source = 'checkpatch';

			if (!(fileName in dictionary)) {
				dictionary[fileName] = [];
			}
			dictionary[fileName].push(diagnostic);
		}

		for (var uri in dictionary) {
			this.diagnosticCollection.set(vscode.Uri.file(path.join(basePath, uri)), dictionary[uri]);
		}

		for (const [fileUri, errors] of Object.entries(dictionary)) {
			numError += Object.keys(errors).length
		}

		return numError;
	}

	private checkpatchFile(textDocument: vscode.TextDocument): any {
		if (textDocument.languageId !== 'c') {
			return;
		}

		if (this.maybeConfigure() != 'ok') {
			this.log(`Check file: bad config yet`);
			return;
		}

		let workspaceFolderPath = undefined;

		if (vscode.workspace.workspaceFolders) {
			for (let folder of vscode.workspace.workspaceFolders) {
				// Here we search for the most long path overlap.
				// For cases when subfolders are included to workspace as workspace folders.
				if (textDocument.fileName.startsWith(folder.uri.fsPath)
					&& (!workspaceFolderPath || folder.uri.fsPath.length > workspaceFolderPath.length)) {
						workspaceFolderPath = folder.uri.fsPath;
				}
			}
		}

		let linterPath:   [any, string] = [undefined, ''];
		let linterArgs:   [any, string] = [undefined, ''];
		let excludeGlobs: [any, string] = [undefined, ''];
		let useAsCwd:     [any, string] = [undefined, ''];
		let linterCwd:    [any, string] = [undefined, ''];

		if (workspaceFolderPath) {
			if (workspaceFolderPath in this.folderLinterConfigs) {
				linterPath[0]   = this.folderLinterConfigs[workspaceFolderPath].path;
				linterArgs[0]   = this.folderLinterConfigs[workspaceFolderPath].args;
				excludeGlobs[0] = this.folderLinterConfigs[workspaceFolderPath].excludeGlobs;
				useAsCwd[0]     = this.folderLinterConfigs[workspaceFolderPath].useAsCwd;
			} else {
				this.log(`Check file "${textDocument.fileName}": folder config is not defined!`);
			}
		}

		if (useAsCwd[0] === undefined) {
			useAsCwd = [this.commonLinterConfig.useAsCwd, ' (from common config)'];
		}

		linterCwd = workspaceFolderPath && (linterPath[0] || useAsCwd[0])
			? [workspaceFolderPath, '']
			: [vscode.workspace.workspaceFolders?.[0].uri.fsPath, ' (root folder used as cwd)'];

		if (linterPath[0] === undefined) {
			linterPath = [this.commonLinterConfig.path, ' (from common config)'];
		}
		if (linterArgs[0] === undefined) {
			linterArgs = [this.commonLinterConfig.args, ' (from common config)'];
		}
		if (excludeGlobs[0] === undefined) {
			excludeGlobs = [this.commonLinterConfig.excludeGlobs, ' (from common config)'];
		}

		this.log(
			`Check file "${textDocument.fileName}":\n` +
			`  - workspace folder: ${this.prettify(workspaceFolderPath)}\n` +
			`  - checkpatchPath:   ${this.prettify(linterPath[0]) + linterPath[1]}\n` +
			`  - checkpatchArgs:   ${this.prettify(linterArgs[0]) + linterArgs[1]}\n` +
			`  - exclude:          ${this.prettify(excludeGlobs[0]) + excludeGlobs[1]}\n` +
			`  - useFolderAsCwd:   ${useAsCwd[0] + useAsCwd[1]}\n` +
			`  - cwd:              ${this.prettify(linterCwd[0]) + linterCwd[1]}`
		);

		for (var excludeGlob of excludeGlobs[0]) {
			if (minimatch(textDocument.fileName, excludeGlob)) {
				return;
			}
		}

		linterArgs[0] = linterArgs[0].slice();
		linterArgs[0].push('--show-types');
		linterArgs[0].push('--showfile');
		linterArgs[0].push('-f');
		linterArgs[0].push(textDocument.fileName.replace(/\\/g, '/'));

		let log = '';
		let childProcess = cp.spawn(linterPath[0], linterArgs[0], { shell: true, cwd: linterCwd[0] });
		if (childProcess.pid) {
			// clean old diagostics. Prevents files with only one warning from being updated
			this.diagnosticCollection.delete(textDocument.uri);
			childProcess.stdout.on('data', (data: Buffer) => log += data);
			childProcess.stdout.on('end', () => {
				let numError = this.parseCheckpatchLog(log, '')
				this.log(`Check file "${textDocument.fileName}": done, ${numError} errors found`);
			});
		} else {
			this.log(
				`Check file "${textDocument.fileName}": failed to call "${linterPath[0]}"\
				${childProcess.stderr ? '. Stderr: "' + childProcess.stderr.toString().trim() + '"' : ''}`
			);
			vscode.window.showErrorMessage(`Checkpatch [file]: Check failed. Please, review the output pane for details`);
		}
	}

	private async checkpatchCommit(): Promise<void> {
		if (this.maybeConfigure() != 'ok') {
			this.log(`Check commit: bad config yet`);
			return;
		}

		let repo: Repository;
		if (this.git.repositories.length === 0) {
			vscode.window.showErrorMessage(`Checkpatch [commit]: No repositories in workspace`);
			return;
		}
		if (this.git.repositories.length === 1) {
			repo = this.git.repositories[0];
		} else {
			const reposItems: RepoPickItem[] = this.git.repositories.map(repo => {
				return {
					label: path.basename(repo.rootUri.fsPath),
					description: repo.rootUri.fsPath,
					repo: repo
				};
			});
			const value = await vscode.window.showQuickPick(reposItems, { placeHolder: 'Select git repo' });
			if (value && value.repo) {
				repo = value.repo;
			} else {
				return;
			}
		}

		const commits = await repo.log({ maxEntries: 8 });
		const commitsItems: vscode.QuickPickItem[] = commits.map(commit => {
			return {
				label: commit.message,
				description: commit.hash
			};
		});
		const commitValue = await vscode.window.showQuickPick(commitsItems, { placeHolder: 'Select commit' });

		if (commitValue && commitValue.description) {
			let workspaceFolderPath = undefined;

			if (vscode.workspace.workspaceFolders) {
				for (let folder of vscode.workspace.workspaceFolders) {
					if (repo.rootUri.path == folder.uri.fsPath) {
						workspaceFolderPath = repo.rootUri.path;
						break;
					}
				}
			}

			let linterPath: [any, string] = [undefined, ''];
			let linterArgs: [any, string] = [undefined, ''];
			let useAsCwd:   [any, string] = [undefined, ''];
			let linterCwd:  [any, string] = [undefined, ''];

			if (workspaceFolderPath) {
				if (workspaceFolderPath in this.folderLinterConfigs) {
					linterPath[0] = this.folderLinterConfigs[workspaceFolderPath].path;
					linterArgs[0] = this.folderLinterConfigs[workspaceFolderPath].args;
					useAsCwd[0]   = this.folderLinterConfigs[workspaceFolderPath].useAsCwd;
				} else {
					this.log(`Check commit ${commitValue.description} @ "${repo.rootUri.path}": folder config is not defined!`);
				}
			}

			if (useAsCwd[0] === undefined) {
				useAsCwd = [this.commonLinterConfig.useAsCwd, ' (from common config)'];
			}

			linterCwd = workspaceFolderPath && (linterPath[0] || useAsCwd[0])
				? [workspaceFolderPath, '']
				: [vscode.workspace.workspaceFolders?.[0].uri.fsPath, ' (root folder used as cwd)'];

			if (linterPath[0] === undefined) {
				linterPath = [this.commonLinterConfig.path, ' (from common config)'];
			}
			if (linterArgs[0] === undefined) {
				linterArgs = [this.commonLinterConfig.args, ' (from common config)'];
			}

			this.log(
				`Check commit ${commitValue.description} @ "${repo.rootUri.path}":\n` +
				`  - workspace folder: ${this.prettify(workspaceFolderPath)}\n` +
				`  - checkpatchPath:   ${this.prettify(linterPath[0]) + linterPath[1]}\n` +
				`  - checkpatchArgs:   ${this.prettify(linterArgs[0]) + linterArgs[1]}\n` +
				`  - useFolderAsCwd:   ${useAsCwd[0] + useAsCwd[1]}\n` +
				`  - cwd:              ${this.prettify(linterCwd[0]) + linterCwd[1]}`
			);

			linterArgs[0] = linterArgs[0].slice();
			linterArgs[0].push('--show-types');
			linterArgs[0].push('--showfile');
			linterArgs[0].push('-g');
			linterArgs[0].push(commitValue.description);

			let log = '';
			let childProcess = cp.spawn(linterPath[0], linterArgs[0], { shell: true, cwd: linterCwd[0] });
			if (childProcess.pid) {
				childProcess.stdout.on('data', (data: Buffer) => log += data);
				childProcess.stdout.on('end', () => {
					// for user to see only commit related problems:
					this.diagnosticCollection.clear();
					const numError = this.parseCheckpatchLog(log, repo.rootUri.fsPath);
					if (numError > 0) {
						vscode.window.showErrorMessage(`Checkpatch [commit]: Commit has style problems, please review the problems pane`);
						vscode.commands.executeCommand('workbench.actions.view.problems');
					} else {
						vscode.window.showInformationMessage(`Checkpatch [commit]: Commit has no obvious style problems and is ready for submission`);
					}

					this.log(`Check commit ${commitValue.description} @ "${repo.rootUri.path}": done, ${numError} errors found`);
				});
			} else {
				this.log(
					`Check commit ${commitValue.description} @ "${repo.rootUri.path}": failed to call "${linterPath[0]}"\
					${childProcess.stderr ? '. Stderr: "' + childProcess.stderr.toString().trim() + '"' : ''}`
				);
				vscode.window.showErrorMessage(`Checkpatch [commit]: Check failed. Please, review the output pane for details`);
			}
		}
	}

	public provideCodeActions(
		document: vscode.TextDocument, range: vscode.Range,
		context: vscode.CodeActionContext, token: vscode.CancellationToken):
		vscode.ProviderResult<vscode.Command[]> {
		return [];
	}
}
