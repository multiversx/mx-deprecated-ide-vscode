import * as vscode from "vscode";
import { Memento } from "vscode";
import { CodingSession } from "./codingSession";
import { askCodingSessionName } from "./codingSessionPresenter";
import { CodingSessionsTreeItem } from "./codingSessionsTreeItem";

interface IRepository {
    getAll(): CodingSession[];
    add(item: CodingSession): Promise<void>;
    remove(identifier: string): Promise<void>;
}

interface ICreator {
    createSession(): Promise<string>;
}

export class CodingSessionsTreeDataProvider implements vscode.TreeDataProvider<CodingSessionsTreeItem> {
    private readonly creator: ICreator;
    private readonly repository: IRepository;
    private readonly memento: Memento;
    private models: CodingSession[] = [];

    private readonly _onDidChangeTreeData: vscode.EventEmitter<CodingSessionsTreeItem | undefined> = new vscode.EventEmitter<CodingSessionsTreeItem | undefined>();
    readonly onDidChangeTreeData?: vscode.Event<CodingSessionsTreeItem | undefined> = this._onDidChangeTreeData.event;

    constructor(options: {
        creator: ICreator,
        repository: IRepository,
        memento: Memento
    }) {
        this.creator = options.creator;
        this.repository = options.repository;
        this.memento = options.memento;
    }

    async refresh() {
        this.models = this.repository.getAll();
        await this.refreshSuperficially();
    }

    private async refreshSuperficially() {
        this._onDidChangeTreeData.fire(undefined);
    }

    async selectCodingSession(identifier: string) {
        await this.setSelected(identifier);
        await this.refreshSuperficially();
    }

    getTreeItem(element: CodingSessionsTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: CodingSessionsTreeItem): vscode.ProviderResult<CodingSessionsTreeItem[]> {
        if (element) {
            return [];
        }

        const selectedIdentifier = this.getSelectedCodingSession();

        return this.models.map(item => new CodingSessionsTreeItem({
            model: item,
            isSelected: item.identifier === selectedIdentifier
        }));
    }

    async createCodingSession(): Promise<CodingSession> {
        const name = await askCodingSessionName();
        if (!name) {
            return null;
        }

        const identifier = await this.creator.createSession();
        const session = new CodingSession({ name: name, identifier: identifier });
        await this.repository.add(session);
        await this.setSelected(identifier);
        await this.refresh();

        return session;
    }

    async removeCodingSession(identifier: string) {
        const selectedIdentifier = this.getSelectedCodingSession();

        if (selectedIdentifier === identifier) {
            await this.resetSelected();
        }

        await this.repository.remove(identifier);
        this.refresh();
    }

    private async resetSelected() {
        await this.memento.update("selectedCodingSession", undefined);
        await this.triggerRefreshAssistant();
    }

    private async setSelected(identifier: string) {
        await this.memento.update("selectedCodingSession", identifier);
        await this.triggerRefreshAssistant();
    }

    public getSelectedCodingSession(): string {
        return this.memento.get<string>("selectedCodingSession");
    }

    private async triggerRefreshAssistant() {
        await vscode.commands.executeCommand("multiversx.refreshAssistant");
    }
}