import * as vscode from "vscode";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"];

vscode.commands.executeCommand(
	"setContext",
	"ext.imageExtensions",
	IMAGE_EXTENSIONS.map((i) => `.${i}`),
);

interface SIVMessage {
	command: "prev" | "next";
}

interface SIVInstance {
	panel: vscode.WebviewPanel;
	imageFilePaths: vscode.Uri[];
	currentIndex: number;
	disposed: boolean;
}

let instances: SIVInstance[] = [];

export function activate(context: vscode.ExtensionContext) {
	setWhenClause();

	const disposable = vscode.commands.registerCommand(
		"sequential-image-viewer.openFile",
		async (args) => {
			let imageFilePath: vscode.Uri[] | undefined;
			if (args === undefined) {
				// If not opened through context menu, show open file dialog
				imageFilePath = await vscode.window.showOpenDialog({
					canSelectFiles: true,
					canSelectFolders: false,
					canSelectMany: false,
					filters: {
						/* eslint-disable-next-line @typescript-eslint/naming-convention */
						Images: IMAGE_EXTENSIONS,
					},
				});
			} else {
				// Get file path from args
				imageFilePath = [vscode.Uri.parse(args)];
			}

			// Cancel if undefined (which means the user didn't select any file)
			if (imageFilePath === undefined) {
				return;
			}

			// Get all the image files belonging in the same folder
			const folderPath = vscode.workspace
				.asRelativePath(imageFilePath[0])
				.split("/")
				.slice(0, -1)
				.join("/");
			const imageFilePaths = await vscode.workspace.findFiles(
				(folderPath ? folderPath + "/" : "") +
					"*." +
					`{${IMAGE_EXTENSIONS.join(",")}}`,
			);
			let currentIndex: number | undefined;

			// Sort by filename (since originally findFiles also sorted it by extension)
			imageFilePaths.sort((a, b) => {
				const left = a.fsPath.split("/").pop() ?? "";
				const right = b.fsPath.split("/").pop() ?? "";
				return left.localeCompare(right, undefined, {
					numeric: true,
					sensitivity: "base",
				});
			});

			// Determine index by comparing paths
			for (let index = 0; index < imageFilePaths.length; index++) {
				if (imageFilePaths[index].fsPath === imageFilePath[0].fsPath) {
					currentIndex = index;
				}
			}
			if (currentIndex === undefined) {
				vscode.window.showErrorMessage(
					"Could not determine image file's index in directory.",
				);
				return;
			}

			const panel = vscode.window.createWebviewPanel(
				"sequential-image-viewer",
				"SIV",
				{
					viewColumn: vscode.ViewColumn.Beside,
					preserveFocus: true,
				},
				{
					enableScripts: true,
				},
			);

			let instance: SIVInstance = {
				panel,
				imageFilePaths,
				currentIndex,
				disposed: false,
			};
			panel.onDidDispose(() => {
				const index = instances.indexOf(instance);
				if (index >= 0) {
					instances.splice(index, 1);
					setWhenClause();
				}
			});

			// Handle messages from the webview
			panel.webview.onDidReceiveMessage(
				(message: SIVMessage) => {
					if (message.command === "next") {
						changeImage(instance, instance.currentIndex + 1);
					}
					if (message.command === "prev") {
						changeImage(instance, instance.currentIndex - 1);
					}
				},
				undefined,
				context.subscriptions,
			);

			panel.webview.html = generateHtml(panel, {
				uri: imageFilePath[0],
				index: instance.currentIndex,
				of: imageFilePaths.length,
			});

			// Add to instances list
			instances.push(instance);
			setWhenClause();
		},
	);

	context.subscriptions.push(disposable);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand("sequential-image-viewer.nextImage", () => {
			for (const instance of instances) {
				changeImage(instance, instance.currentIndex + 1);
			}
		}),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand("sequential-image-viewer.prevImage", () => {
			for (const instance of instances) {
				changeImage(instance, instance.currentIndex - 1);
			}
		}),
	);
}

export function deactivate() {
	for (const instance of instances) {
		instance.panel.dispose();
	}
}

function changeImage(instance: SIVInstance, toIndex: number) {
	// Wrap around to last index if negative, and wrap back to first index if larger than image count
	if (toIndex < 0) {
		toIndex = instance.imageFilePaths.length - 1;
	} else if (toIndex >= instance.imageFilePaths.length) {
		toIndex = 0;
	}

	instance.panel.webview.html = generateHtml(instance.panel, {
		uri: instance.imageFilePaths[toIndex],
		index: toIndex,
		of: instance.imageFilePaths.length,
	});
	instance.panel.webview.postMessage({ command: "scroll-to-top" });

	instance.currentIndex = toIndex;
}

function generateHtml(
	panel: vscode.WebviewPanel,
	image: { uri: vscode.Uri; index?: number; of?: number },
): string {
	// Set title from filename (SIV ({index}) {filename})
	const title = image.uri.path.split("/").pop();
	let index = "";
	if (image.index !== undefined) {
		index = "(" + (image.index + 1).toString();
		if (image.of !== undefined) {
			index += "/" + image.of.toString();
		}
		index += ") ";
	}

	panel.title = `SIV ${index}${title}`;

	// Get image
	const finalImageFilePath = panel.webview.asWebviewUri(image.uri);

	return `<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>SIV</title>
				<style>
					.navigation-buttons {
						position: fixed;
						top: 0;
						bottom: 0;
						margin: auto 0;
						width: 10%;
						max-width: 40px;
						border: 0,
						background: rgba(255,255,255,0.2);
						padding-left: 4px;
						padding-right: 4px;
						cursor: pointer;
					}
					.float-left { left: 0.5em; }
					.float-right { right: 0.5em; }
					.text-center { text-align: center; }
					#the-image {
						-moz-user-select: none;
						-webkit-user-select: none;
						user-select: none;
						pointer-events: none;
						width: 90%;
					}
				</style>
			</head>
			<body>
				<div class="text-center">
					<img id="the-image" src="${finalImageFilePath}">
				</div>
				<button class="navigation-buttons float-left" id="btn-previous-image">
					<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 455 455" style="enable-background:new 0 0 455 455" xml:space="preserve"><path d="M227.5,0C101.855,0,0,101.855,0,227.5S101.855,455,227.5,455S455,353.145,455,227.5S353.145,0,227.5,0z M276.772,334.411 l-21.248,21.178L127.852,227.5L255.524,99.411l21.248,21.178L170.209,227.5L276.772,334.411z"/><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g></svg>
				</button>
				<button class="navigation-buttons float-right" id="btn-next-image">
					<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 455 455" style="enable-background:new 0 0 455 455" xml:space="preserve"><path d="M227.5,0C101.855,0,0,101.855,0,227.5S101.855,455,227.5,455S455,353.145,455,227.5S353.145,0,227.5,0z M199.476,355.589 l-21.248-21.178L284.791,227.5L178.228,120.589l21.248-21.178L327.148,227.5L199.476,355.589z"/><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g></svg>
				</button>
				<script type="text/javascript">
					const vscode = acquireVsCodeApi();
					document.addEventListener('DOMContentLoaded', (event) => {
						document.getElementById('btn-previous-image').addEventListener('click', function () {
							vscode.postMessage({
								command: 'prev',
							})
						})
						document.getElementById('btn-next-image').addEventListener('click', function () {
							vscode.postMessage({
								command: 'next',
							})
						})

						window.addEventListener('message', event => {
							const message = event.data;
							if (message.command == 'scroll-to-top') {
								window.scrollTo(0, 0);
							}
						});
					})
				</script>
			</body>
		</html>
	`;
}

function setWhenClause() {
	vscode.commands.executeCommand(
		"setContext",
		"sequential-image-viewer.someInstanceOpen",
		instances.length > 0,
	);
}
