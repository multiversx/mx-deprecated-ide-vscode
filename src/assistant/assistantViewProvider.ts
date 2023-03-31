import * as vscode from "vscode";
import { Uri } from "vscode";
import { onTopLevelError } from "../errors";
import { Settings } from "../settings";
import { Answer, AnswerHeader } from "./answer";
import { AnswerStream } from "./answerStream";
import { IAnswerFinished, IAskQuestionRequested, IDisplayAnswerRequested, IInitialize as IRefreshHistory, MessageType } from "./messages";
const mainHtml = require("./main.html");

interface IAssistant {
    askAnything(options: { question: string }): Promise<AnswerStream>;
    getAnswersHeaders(): AnswerHeader[];
    getAnswer(options: { sourceStreamId: string }): Answer;
    isAnyCodingSessionOpen(): boolean;
}

interface IAnswerPanelController {
    displayAnswerStream(options: { answerStream: AnswerStream }): Promise<void>;
    displayAnswer(options: { answer: Answer }): Promise<void>;
}

export class AssistantViewProvider implements vscode.WebviewViewProvider {
    private readonly extensionUri: Uri;
    private readonly assistant: IAssistant;
    private readonly answerPanelController: IAnswerPanelController;
    private readonly messaging: Messaging;

    private _view?: vscode.WebviewView;

    constructor(options: {
        extensionUri: Uri;
        assistant: IAssistant,
        answerPanelController: IAnswerPanelController
    }) {
        this.extensionUri = options.extensionUri;
        this.assistant = options.assistant;
        this.answerPanelController = options.answerPanelController;
        this.messaging = new Messaging({
            webviewGetter: () => this._view?.webview
        });
    }

    async resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext<unknown>,
        _token: vscode.CancellationToken
    ): Promise<void> {
        try {
            await this.tryResolveWebviewView(webviewView);
        } catch (error: any) {
            onTopLevelError(error);
        }
    }

    private async tryResolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            enableForms: true,
            localResourceRoots: [this.extensionUri],
        };

        this.messaging.onAskQuestionRequested(async question => {
            await this.askQuestion(question);
        });

        this.messaging.onDisplayAnswerRequested(async item => {
            const answer = this.assistant.getAnswer(item);
            await this.answerPanelController.displayAnswer({ answer: answer });
        });

        await this.refresh();
    }

    private async askQuestion(question: string): Promise<void> {
        const answerStream = await this.assistant.askAnything({ question: question });
        await this.answerPanelController.displayAnswerStream({ answerStream: answerStream });

        answerStream.onDidFinish(async () => {
            await this.messaging.sendAnswerFinished();
            await this.refresh();
        });
    }

    async refresh(): Promise<void> {
        if (!this._view) {
            return;
        }

        const webview = this._view.webview;

        if (!Settings.isAskAnythingEnabled()) {
            webview.html = "The <strong>ask anything</strong> feature of the assistant is not enabled. Please follow the <strong>Welcome</strong> instructions in order to enable it.";
            return;
        }

        if (!this.assistant.isAnyCodingSessionOpen()) {
            webview.html = "In the Coding Sessions view, create a coding session (or choose an existing one) in order to interact with the assistant.";
            return;
        }

        webview.html = await this.getHtmlForWebview(webview);

        const answersHeaders = this.assistant.getAnswersHeaders();
        await this.messaging.sendRefreshHistory(answersHeaders);
    }

    private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        const uriJs = webview.asWebviewUri(Uri.joinPath(this.extensionUri, ...["dist", "assistant.js"]));
        const html = mainHtml.replace("{{uriJs}}", uriJs.toString());
        return html;
    }
}

class Messaging {
    private readonly getWebview: () => vscode.Webview;

    constructor(options: {
        webviewGetter: () => vscode.Webview;
    }) {
        this.getWebview = options.webviewGetter;
    }

    async sendRefreshHistory(items: any[]) {
        if (!this.hasWebview()) {
            return;
        }

        const message: IRefreshHistory = {
            type: MessageType.refreshHistory,
            value: {
                items: items
            }
        };

        this.getWebview().postMessage(message);
    }

    onAskQuestionRequested(callback: (question: string) => Promise<void>) {
        if (!this.hasWebview()) {
            return;
        }

        this.getWebview().onDidReceiveMessage(async (message: IAskQuestionRequested) => {
            if (message.type !== MessageType.askQuestionRequested) {
                return;
            }

            try {
                await callback(message.value.question);
            } catch (error: any) {
                onTopLevelError(error);
            }
        });
    }

    async sendAnswerFinished() {
        if (!this.hasWebview()) {
            return;
        }

        const message: IAnswerFinished = {
            type: MessageType.answerFinished
        };

        this.getWebview().postMessage(message);
    }

    onDisplayAnswerRequested(callback: (item: any) => void) {
        if (!this.hasWebview()) {
            return;
        }

        this.getWebview().onDidReceiveMessage((message: IDisplayAnswerRequested) => {
            if (message.type !== MessageType.displayAnswerRequested) {
                return;
            }

            callback(message.value.item);
        });
    }

    private hasWebview(): boolean {
        return this.getWebview() ? true : false;
    }
}