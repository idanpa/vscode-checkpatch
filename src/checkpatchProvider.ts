'use strict';
import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import * as minimatch from 'minimatch';
import { GitExtension, API as GitAPI, Repository, } from './typings/git';

export interface LinterConfig {
	path: string;
	args: string[];
	excludeGlobs: string[];
}

interface RepoPickItem extends vscode.QuickPickItem {
	repo: Repository;
}

export default class CheckpatchProvider implements vscode.CodeActionProvider {
	private linterConfig!: LinterConfig;
	private documentListener!: vscode.Disposable;
	private diagnosticCollection = vscode.languages.createDiagnosticCollection('checkpatch');
	private git!: GitAPI;

	public activate(subscriptions: vscode.Disposable[]) {
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
	}

	private loadConfig(): void {
		const config = vscode.workspace.getConfiguration('checkpatch');

		this.linterConfig = {
			path: config.checkpatchPath,
			args: config.checkpatchArgs,
			excludeGlobs: config.exclude,
		};

		if (this.documentListener) {
			this.documentListener.dispose();
		}
		this.diagnosticCollection.clear();

		// testing given configuration:
		var re = /total: \d* errors, \d* warnings, \d* lines checked/g;
		let args = this.linterConfig.args.slice();
		args.push('--no-tree - ');
		let childProcess = cp.spawnSync(this.linterConfig.path, args, { shell: true, input: ' ' });
		if (childProcess.pid && re.test(childProcess.stdout.toString())) {
			// all good
		} else {
			vscode.window.showErrorMessage(
				`Checkpatch: calling '${this.linterConfig.path}' failed, please check checkpatch.checkpatchPath and checkpatch.checkpatchPath configutations.`);
			console.log(`Checkpatch: '${this.linterConfig.path}' '${args}'`)
			if (childProcess.stderr)
				console.log(`Checkpatch: '${childProcess.stderr.toString()}'`)
			return;
		}

		if (config.run === 'onSave') {
			this.documentListener = vscode.workspace.onDidSaveTextDocument(this.checkpatchFile, this);
			vscode.workspace.onDidOpenTextDocument(this.checkpatchFile, this);
			vscode.workspace.textDocuments.forEach(this.checkpatchFile, this);
		}
	}

	public dispose(): void {
		this.diagnosticCollection.clear();
		this.diagnosticCollection.dispose();
	}

	private parseCheckpatchLog(log: string, basePath: string): number {
		const dictionary: { [fileUri: string]: vscode.Diagnostic[] } = {};

		var re = /(WARNING|ERROR): ?(.+):(.+)?(?:\n|\r\n|)#\d+: FILE: (.*):(\d+):/g;
		var matches;
		while (matches = re.exec(log)) {
			let type = matches[2];
			let message = matches[3];
			let fileName = matches[4];
			let errorline = parseInt(matches[5]);
			let range = new vscode.Range(errorline - 1, 0, errorline - 1, Number.MAX_VALUE);

			let diagnostic = new vscode.Diagnostic(range, `${type}:${message}`, vscode.DiagnosticSeverity.Information);
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

		return Object.keys(dictionary).length;
	}

	private checkpatchFile(
		textDocument: vscode.TextDocument): any {
		if (textDocument.languageId !== 'c') {
			return;
		}
		for (var excludeGlob of this.linterConfig.excludeGlobs) {
			if (minimatch(textDocument.fileName, excludeGlob)) {
				return;
			}
		}

		let log = '';
		let args = this.linterConfig.args.slice();
		args.push('--show-types -f');
		args.push(textDocument.fileName.replace(/\\/g, '/'));

		let childProcess = cp.spawn(this.linterConfig.path, args, { shell: true });
		if (childProcess.pid) {
			childProcess.stdout.on('data', (data: Buffer) => log += data);
			childProcess.stdout.on('end', () => this.parseCheckpatchLog(log, ''));
		} else {
			vscode.window.showErrorMessage(
				`Checkpatch: calling '${this.linterConfig.path}' failed, please check checkpatch is available and change config.checkpatchPath accordingly`);
			return;
		}
	}

	private async checkpatchCommit(): Promise<void> {
		let repo: Repository;
		if (this.git.repositories.length === 0) {
			vscode.window.showErrorMessage(`Checkpatch: No repositories in workspace`);
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
			let log = '';
			let args = this.linterConfig.args.slice();
			args.push('-g');
			args.push(commitValue.description);

			let childProcess = cp.spawn(this.linterConfig.path, args, { shell: true, cwd: repo.rootUri.fsPath });
			if (childProcess.pid) {
				childProcess.stdout.on('data', (data: Buffer) => log += data);
				childProcess.stdout.on('end', () => {
					// for user to see only commit related problems:
					this.diagnosticCollection.clear();
					const numError = this.parseCheckpatchLog(log, repo.rootUri.fsPath);
					if (numError > 0) {
						vscode.window.showErrorMessage(`Checkpatch: commit has style problems, please review the problems pane`);
						vscode.commands.executeCommand('workbench.actions.view.problems');
					} else {
						vscode.window.showInformationMessage(`Checkpatch: commit has no obvious style problems and is ready for submission.`);
					}
				});
			} else {
				vscode.window.showErrorMessage(
					`Checkpatch: calling '${this.linterConfig.path}' failed, please check checkpatch is available and change config.checkpatchPath accordingly`);
				return;
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
