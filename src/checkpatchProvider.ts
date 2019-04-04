'use strict';
import * as cp from 'child_process';
import * as vscode from 'vscode';

export interface LinterConfig {
	path: string;
	args: string[];
}

export default class CheckpatchProvider implements vscode.CodeActionProvider {
	private linterConfig!: LinterConfig;
	private documentListener!: vscode.Disposable;
	private diagnosticCollection = vscode.languages.createDiagnosticCollection();

	public activate(subscriptions: vscode.Disposable[]) {
		subscriptions.push(this);
		vscode.workspace.onDidCloseTextDocument((textDocument) => {
			this.diagnosticCollection.delete(textDocument.uri);
		}, null, subscriptions);

		vscode.workspace.onDidChangeConfiguration(this.loadConfig, this, subscriptions);
		this.loadConfig();

		vscode.commands.registerCommand('checkpatch.checkFile', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return;
			}
			this.doLint(editor.document);
		});
	}

	private loadConfig(): void {
		const config = vscode.workspace.getConfiguration('checkpatch');

		this.linterConfig = {
			path: config.checkpatchPath,
			args: config.checkpatchArgs,
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
				`Checkpatch: calling '${this.linterConfig.path}' failed, please check checkpatch is available and change config.checkpatchPath accordingly`);
			return;
		}

		if (config.run === 'onSave') {
			this.documentListener = vscode.workspace.onDidSaveTextDocument(this.doLint, this);
			vscode.workspace.onDidOpenTextDocument(this.doLint, this);
			vscode.workspace.textDocuments.forEach(this.doLint, this);
		}
	}

	public dispose(): void {
		this.diagnosticCollection.clear();
		this.diagnosticCollection.dispose();
	}

	private doLint(
		textDocument: vscode.TextDocument): any {
		if (textDocument.languageId !== 'c') {
			return;
		}

		let log = '';
		let diagnostics: vscode.Diagnostic[] = [];

		let args = this.linterConfig.args.slice();
		args.push('-f');
		args.push(textDocument.fileName.replace(/\\/g, '/'));

		let childProcess = cp.spawn(this.linterConfig.path, args, { shell: true });
		if (childProcess.pid) {
			childProcess.stdout.on('data', (data: Buffer) => { log += data; });
			childProcess.stdout.on('end', () => {

				var re = /(WARNING|ERROR): ?(.+)?(?:\n|\r\n|)#\d+: FILE: (.*):(\d+):/g;
				var matches;
				while (matches = re.exec(log)) {
					let message = matches[2];
					let errorline = parseInt(matches[4]);
					let range = new vscode.Range(errorline - 1, 0, errorline - 1, 0);
					let severity;

					if (matches) {
						if (matches[1] === 'WARNING') {
							severity = vscode.DiagnosticSeverity.Warning;
						} else if (matches[1] === 'ERROR') {
							severity = vscode.DiagnosticSeverity.Error;
						}

						let diagnostic =
							new vscode.Diagnostic(range, message, severity);
						diagnostics.push(diagnostic);
					}
				}

				this.diagnosticCollection.set(textDocument.uri, diagnostics);
			});
		} else {
			vscode.window.showErrorMessage(
				`Checkpatch: calling '${this.linterConfig.path}' failed, please check checkpatch is available and change config.checkpatchPath accordingly`);
			return;
		}
	}

	public provideCodeActions(
		document: vscode.TextDocument, range: vscode.Range,
		context: vscode.CodeActionContext, token: vscode.CancellationToken):
		vscode.ProviderResult<vscode.Command[]> {
		throw new Error('Not implemented.');
	}
}
