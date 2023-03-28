import path = require("path");
import { Settings } from "./settings";

export class Environment {
    static getForTerminal(): any {
        let sdkPath = path.join("${env:HOME}", Settings.getSdkPathRelativeToHome());
        let vmToolsFolder = path.join(sdkPath, "vmtools");
        let rustFolder = path.join(sdkPath, "vendor-rust");
        let rustBinFolder = path.join(rustFolder, "bin");

        return {
            "PATH": `${sdkPath}:${rustBinFolder}:${vmToolsFolder}:${process.env["PATH"]}`,
            "RUSTUP_HOME": rustFolder,
            "CARGO_HOME": rustFolder
        };
    }
}
