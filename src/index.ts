/*
    Owner: azazelm3dj3d (https://github.com/azazelm3dj3d)
    Project: aniFace
    License: BSD 2-Clause
*/

"use strict"

import * as vscode from "vscode"

// Activated extension
export function activate(context: vscode.ExtensionContext) {
    const provider = new CustomSidebarViewProvider(context.extensionUri)

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            CustomSidebarViewProvider.viewType,
            provider
        )
    )

    let errorLensEnabled: boolean = true

    // Commands are defined in the package.json file
    let disposableEnableErrorLens = vscode.commands.registerCommand(
        "ErrorLens.enable",
        () => {
            errorLensEnabled = true

            const activeTextEditor: vscode.TextEditor | undefined =
                vscode.window.activeTextEditor
            if (activeTextEditor) {
                updateDecorationsForUri(activeTextEditor.document.uri)
            }
        }
    )

    context.subscriptions.push(disposableEnableErrorLens)

    let disposableDisableErrorLens = vscode.commands.registerCommand(
        "ErrorLens.disable",
        () => {
            errorLensEnabled = false

            const activeTextEditor: vscode.TextEditor | undefined =
                vscode.window.activeTextEditor
            if (activeTextEditor) {
                updateDecorationsForUri(activeTextEditor.document.uri)
            }
        }
    )

    context.subscriptions.push(disposableDisableErrorLens)

    vscode.languages.onDidChangeDiagnostics(
        (diagnosticChangeEvent) => {
            onChangedDiagnostics(diagnosticChangeEvent)
        },
        null,
        context.subscriptions
    )

    vscode.workspace.onDidOpenTextDocument(
        (textDocument) => {
            updateDecorationsForUri(textDocument.uri)
        },
        null,
        context.subscriptions
    )

    // Update on editor switch
    vscode.window.onDidChangeActiveTextEditor(
        (textEditor) => {
            if (textEditor === undefined) {
                return
            }
            updateDecorationsForUri(textEditor.document.uri)
        },
        null,
        context.subscriptions
    )

    const onChangedDiagnostics = (
        diagnosticChangeEvent: vscode.DiagnosticChangeEvent
    ) => {
        if (!vscode.window) {
            return
        }

        const activeTextEditor: vscode.TextEditor | undefined =
            vscode.window.activeTextEditor
        if (!activeTextEditor) {
            return
        }

        // Only update decorations for the active text editor
        for (const uri of diagnosticChangeEvent.uris) {
            if (uri.fsPath === activeTextEditor.document.uri.fsPath) {
                updateDecorationsForUri(uri)
                break
            }
        }
    }

    const updateDecorationsForUri = (uriToDecorate: vscode.Uri) => {
        if (!uriToDecorate) return

        // Only process "file://" URIs
        if (uriToDecorate.scheme !== "file") return

        // Only deal with the active window
        if (!vscode.window) return

        const activeTextEditor: vscode.TextEditor | undefined =
            vscode.window.activeTextEditor

        // Only deal with the active text editor
        if (!activeTextEditor) return

        if (!activeTextEditor.document.uri.fsPath) return

        let numErrors: number = 0
        let numWarnings: number = 0
        let numInfo: number = 0

        if (errorLensEnabled) {
            let aggregatedDiagnostics: any = {}
            let diagnostic: vscode.Diagnostic

            // Iterate over each diagnostic that VS Code has reported for the file
            for (diagnostic of vscode.languages.getDiagnostics(uriToDecorate)) {
                let key = "line" + diagnostic.range.start.line

                if (aggregatedDiagnostics[key]) {
                    // Already added an object for this key, so augment the arrayDiagnostics[] array
                    aggregatedDiagnostics[key].arrayDiagnostics.push(diagnostic)
                } else {
                    // Create a new object for this key, specifying the line and an arrayDiagnostics[] array
                    aggregatedDiagnostics[key] = {
                        line: diagnostic.range.start.line,
                        arrayDiagnostics: [diagnostic]
                    }
                }

                switch (diagnostic.severity) {
                    case 0:
                        numErrors += 1
                        break

                    case 1:
                        numWarnings += 1
                        break

                    case 2:
                        numInfo += 1
                        break
                }
            }
        }
    }
}

class CustomSidebarViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "aniface.openview"

    private _view?: vscode.WebviewView

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        }

        // default webview will show ani0
        webviewView.webview.html = this.getHtmlContent(webviewView.webview, "0")

        // Interval for deciding which aniFace is displayed (runs every second)
        setInterval(() => {
            const errors = getNumErrors()
            let i = "0"

            if (errors) i = errors < 5 ? "1" : errors < 10 ? "2" : "3"
            webviewView.webview.html = this.getHtmlContent(
                webviewView.webview,
                i
            )
        }, 1000)
    }

    private getHtmlContent(webview: vscode.Webview, i: string): string {
        const stylesheetUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri,
                "assets",
                "style",
                "main.css"
            )
        )

        const aniFace = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "assets", `ani${i}.png`)
        )

        return getHtml(aniFace, stylesheetUri)
    }
}

function getHtml(aniFace: vscode.Uri, stylesheetUri: vscode.Uri) {
    const errorNum = getNumErrors()
    const warningNum = getNumWarnings()
    const infoNum = getInfo()

    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <link rel="stylesheet" href="${stylesheetUri}" />
      </head>
      <body>
        <section>
          <img src="${aniFace}">
          <h2 class=${errorNum ? "error" : ""}>
            ${errorNum} ${errorNum === 1 ? "error" : "errors"}
          </h2>
          <h2 class=${warningNum ? "warning" : ""}>
            ${warningNum} ${warningNum === 1 ? "warning" : "warnings"}
          </h2>
          <h2 class=${infoNum ? "info" : ""}>
            ${infoNum} ${infoNum === 1 ? "info" : "info"}
          </h2>
        </section>
      </body>
		</html>
  `
}

// Collects the number of errors in the active file
function getNumErrors(): number {
    const activeTextEditor: vscode.TextEditor | undefined =
        vscode.window.activeTextEditor

    if (!activeTextEditor) return 0

    const document: vscode.TextDocument = activeTextEditor.document

    let numErrors = 0

    let aggregatedDiagnostics: any = {}
    let diagnostic: vscode.Diagnostic

    // Iterate over each diagnostic that VS Code has reported for the file
    for (diagnostic of vscode.languages.getDiagnostics(document.uri)) {
        let key = "line" + diagnostic.range.start.line

        if (aggregatedDiagnostics[key]) {
            aggregatedDiagnostics[key].arrayDiagnostics.push(diagnostic)
        } else {
            aggregatedDiagnostics[key] = {
                line: diagnostic.range.start.line,
                arrayDiagnostics: [diagnostic]
            }
        }

        // Increment number of errors
        if (diagnostic.severity == 0) numErrors += 1
    }

    return numErrors
}

// Collects the number of warnings in the active file
function getNumWarnings(): number {
    const activeTextEditor: vscode.TextEditor | undefined =
        vscode.window.activeTextEditor

    if (!activeTextEditor) return 0

    const document: vscode.TextDocument = activeTextEditor.document

    let numWarnings = 0

    let aggregatedDiagnostics: any = {}
    let diagnostic: vscode.Diagnostic

    // Iterate over each diagnostic that VS Code has reported for the file
    for (diagnostic of vscode.languages.getDiagnostics(document.uri)) {
        let key = "line" + diagnostic.range.start.line

        if (aggregatedDiagnostics[key]) {
            aggregatedDiagnostics[key].arrayDiagnostics.push(diagnostic)
        } else {
            aggregatedDiagnostics[key] = {
                line: diagnostic.range.start.line,
                arrayDiagnostics: [diagnostic]
            }
        }

        // Increment number of warnings
        if (diagnostic.severity == 1) numWarnings += 1
    }

    return numWarnings
}

// Collects the number of informational messages in the active file
const getInfo = (): number => {
    const activeTextEditor: vscode.TextEditor | undefined =
        vscode.window.activeTextEditor

    if (!activeTextEditor) return 0

    const document: vscode.TextDocument = activeTextEditor.document

    let numInfo = 0

    let aggregatedDiagnostics: any = {}
    let diagnostic: vscode.Diagnostic

    // Iterate over each diagnostic that VS Code has reported for the file
    for (diagnostic of vscode.languages.getDiagnostics(document.uri)) {
        let key = "line" + diagnostic.range.start.line

        if (aggregatedDiagnostics[key]) {
            aggregatedDiagnostics[key].arrayDiagnostics.push(diagnostic)
        } else {
            aggregatedDiagnostics[key] = {
                line: diagnostic.range.start.line,
                arrayDiagnostics: [diagnostic]
            }
        }

        // Increment number of informational messages
        if (diagnostic.severity == 2) numInfo += 1
    }

    return numInfo
}

// Deactivate extension
export function deactivate() {}
