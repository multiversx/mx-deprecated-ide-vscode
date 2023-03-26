import { Memento } from "vscode";

export class AssistantFacade {
    private readonly memento: Memento;

    constructor(memento: Memento) {
        this.memento = memento;
    }

    async acceptTerms(options: {
        acceptTermsOfService: boolean;
        acceptPrivacyStatement: boolean;
    }): Promise<void> {
        console.info("AssistantFacade.acceptTerms", options);
        await this.memento.update("assistant.acceptTerms", options);
    }

    async areTermsAccepted(): Promise<{
        acceptTermsOfService: boolean;
        acceptPrivacyStatement: boolean;
    }> {
        return this.memento.get("assistant.acceptTerms", {
            acceptTermsOfService: false,
            acceptPrivacyStatement: false
        });
    }
}
