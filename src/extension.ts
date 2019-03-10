import * as vscode from 'vscode';
import CheckpatchProvider from './checkpatchProvider';

export function activate(context: vscode.ExtensionContext) {
	let linter = new CheckpatchProvider();
	linter.activate(context.subscriptions);
	vscode.languages.registerCodeActionsProvider('c', linter);
}

// this method is called when your extension is deactivated
export function deactivate() {}
