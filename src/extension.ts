import * as vscode from 'vscode';
import child_process = require('child_process');
import path = require('path');
import os = require('os');
import fs = require('fs');
import { ApiClient } from './apiClient';

export function activate(context: vscode.ExtensionContext) {
	registerCustomCommand(context, 'extension.buildCurrentFile', buildCurrentFile);
	registerCustomCommand(context, 'extension.runCurrentFile', runCurrentFile);
	registerCustomCommand(context, 'extension.buildAndRunCurrentFile', buildAndRunCurrentFile);
	registerCustomCommand(context, 'extension.startDebugServer', startDebugServer);
}

export function deactivate() { }

function registerCustomCommand(context: vscode.ExtensionContext, name: string, action: CallableFunction) {
	let disposable = vscode.commands.registerCommand(name, wrapTry(action));
	context.subscriptions.push(disposable);
}

function wrapTry(action: CallableFunction) {
	return () => {
		try {
			action();
		} catch (error) {
			vscode.window.showErrorMessage(error.message);
		}
	};
}

function raisePromiseError(error: any) {
	vscode.window.showErrorMessage(error.message);
	throw error;
}

function buildCurrentFile() {
	let filePath = getActiveFilePath();
	let parsedPath = path.parse(filePath);
	let filePathWithoutExtension = path.join(parsedPath.dir, parsedPath.name);
	let filePath_ll = `${filePathWithoutExtension}.ll`;
	let filePath_o = `${filePathWithoutExtension}.o`;
	let filePath_wasm = `${filePathWithoutExtension}.wasm`;

	let clangPath: any = getConfigurationValue("clangPath");
	let llcPath: any = getConfigurationValue("llcPath");
	let wasmLdPath: any = getConfigurationValue("wasmLdPath");
	let symsFilePath = createTemporaryFile("main.syms", getMainSymsAsText());

	// clang
	executeChildProcess(`${clangPath} -cc1 -Ofast -emit-llvm -triple=wasm32-unknown-unknown-wasm ${filePath}`);
	// llc
	executeChildProcess(`${llcPath} -O3 -filetype=obj "${filePath_ll}" -o "${filePath_o}"`);
	// wasm-ld
	executeChildProcess(`${wasmLdPath} --no-entry "${filePath_o}" -o "${filePath_wasm}" --strip-all -allow-undefined-file=${symsFilePath} -export=_main -export=do_balance -export=topUp -export=transfer`);

	vscode.window.showInformationMessage(`Build done.`);
}

function runCurrentFile() {
	let filePath = getActiveFilePath();
	let parsedPath = path.parse(filePath);
	let filePathWithoutExtension = path.join(parsedPath.dir, parsedPath.name);
	let filePath_wasm = `${filePathWithoutExtension}.wasm`;

	let elrondGoNodeDebugPath: any = getConfigurationValue("elrondGoNodeDebugPath");

	let options: vscode.InputBoxOptions = {
		value: "yourFunction param1 param2 param3",
		prompt: "Enter transaction data (function and parameters)"
	};

	vscode.window.showInputBox(options).then(onInputFulfilled, raisePromiseError).then(() => { }, raisePromiseError);

	function onInputFulfilled(userInput: any) {
		// simple debug
		let output = executeChildProcess(`${elrondGoNodeDebugPath} "${filePath_wasm}" ${userInput}`, true);
		let outputFile = createTemporaryFile("simple_output.txt", output);

		let uri = vscode.Uri.file(outputFile);
		vscode.window.showTextDocument(uri);
	}
}

function buildAndRunCurrentFile() {
	buildCurrentFile();
	runCurrentFile();
}

function getActiveFilePath() {
	let activeTextEditor = vscode.window.activeTextEditor;

	if (!activeTextEditor) {
		throw new Error("Open a file!");
	}

	let path = activeTextEditor.document.uri.fsPath;
	return path;
}

function executeChildProcess(command: string, silentOnError: boolean = false) {
	console.log(`executeChildProcess():\n${command}`);

	var output;

	try {
		output = child_process.execSync(command).toString()
	} catch (error) {
		if (silentOnError) {
			output = error.toString();
		} else {
			throw error;
		}
	}

	console.log("executeChildProcess(): done.");
	return output;
}

function createTemporaryFile(fileName: string, content: string) {
	let filePath = path.join(os.tmpdir(), fileName);
	fs.writeFileSync(filePath, content);
	return filePath;
}

function getMainSymsAsText() {
	let mainSyms = [
		"getOwner",
		"getExternalBalance",
		"blockHash",
		"transfer",
		"getArgument",
		"getArgumentAsInt64",
		"getFunction",
		"getNumArguments",
		"storageStore",
		"storageLoad",
		"storageStoreAsInt64",
		"storageLoadAsInt64",
		"getCaller",
		"getCallValue",
		"getCallValueAsInt64",
		"logMessage",
		"writeLog",
		"finish",
		"getBlockTimestamp",
		"signalError"
	];

	return mainSyms.join("\n")
}

function getConfigurationValue(key: string) {
	let configuration = vscode.workspace.getConfiguration('elrond');
	let value = configuration.get(key);
	return value;
}

function startDebugServer() {
	killServerIfRunning(function() {
		performStartDebugServer();
	});
}

function killServerIfRunning(callback: CallableFunction) {
	let port: any = getConfigurationValue("restApi.port");
	let subprocess = child_process.spawn("fuser", ["-k", `${port}/tcp`]);

	subprocess.stdout.setEncoding('utf8');
	subprocess.stderr.setEncoding('utf8');

	subprocess.stdout.on("data", function (data) {
		console.log(`fuser: ${data}`);
	});

	subprocess.stderr.on("data", function (data) {
		console.error(`fuser: ${data}`);
	});

	subprocess.on("close", function(code) {
		console.log(`fuser exit: ${code}`);
		callback();
	});
}

function performStartDebugServer() {
	let toolPath: any = getConfigurationValue("restApi.toolPath");
	let configPath: any = getConfigurationValue("restApi.configPath");
	let port: any = getConfigurationValue("restApi.port");

	let subprocess = child_process.spawn(toolPath, ["--rest-api-port", port, "--config", configPath]);

	subprocess.stdout.setEncoding('utf8');
	subprocess.stderr.setEncoding('utf8');

	subprocess.stdout.on("data", function (data) {
		console.log(`Debug server: ${data}`);
	});

	subprocess.stderr.on("data", function (data) {
		console.error(`Debug server: ${data}`);
	});
}