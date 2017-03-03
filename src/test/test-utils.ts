import * as net from 'net';
import * as chai from 'chai';
import * as vscode from 'vscode-languageserver';

import { newConnection, registerLanguageHandler } from '../connection';
import { LanguageHandler } from '../lang-handler';
import * as rt from '../request-type';
import { IConnection } from 'vscode-languageserver';
import { uri2path, path2uri } from '../util'

class Channel {
	server: net.Server;
	serverIn: net.Socket;
	serverOut: net.Socket;
	serverConnection: IConnection;

	client: net.Server;
	clientIn: net.Socket;
	clientOut: net.Socket;
	clientConnection: IConnection;
}

let channel: Channel;

export function setUp(langhandler: LanguageHandler, memfs: any, done: (err?: Error) => void) {
	if (channel) {
		throw new Error("channel wasn't torn down properly after previous test suite");
	}
	channel = new Channel();

	let counter = 2;

	function maybeDone() {
		counter--;
		if (counter === 0) {
			channel.serverConnection.listen();
			channel.clientConnection.listen();

			const params: vscode.InitializeParams = {
				processId: 99, // dummy value
				rootPath: 'file:///',
				capabilities: {},
			}

			channel.clientConnection.sendRequest(rt.InitializeRequest.type, params).then(() => {
				done();
			}, (e: any) => {
				console.error(e);
				return done(new Error('initialization failed'));
			});
		}
	}

	channel.server = net.createServer((stream) => {
		channel.serverIn = stream;
		channel.serverConnection = newConnection(channel.serverIn, channel.serverOut, { trace: true });
		registerLanguageHandler(channel.serverConnection, true, langhandler);
		maybeDone();
	});
	channel.client = net.createServer((stream) => {
		channel.clientIn = stream;
		channel.clientConnection = newConnection(channel.clientIn, channel.clientOut, { trace: false });
		initFs(channel.clientConnection, memfs);
		maybeDone();
	});
	channel.server.listen(0, () => {
		channel.client.listen(0, () => {
			channel.clientOut = net.connect(channel.server.address().port);
			channel.serverOut = net.connect(channel.client.address().port);
		});
	});
}

function initFs(connection: IConnection, memfs: any) {
	connection.onRequest({ method: 'workspace/xfiles' }, (params: { base?: string }): vscode.TextDocumentIdentifier[] => {
		const basePath = uri2path(params.base).substring(1);
		const segments = basePath.length > 0 ? basePath.split('/') : [];
		let node = memfs;
		// Find base node
		for (const segment of segments) {
			node = node[segment];
			if (!node || typeof node !== 'object') {
				throw new Error('No such directory: ' + basePath);
			}
		}
		const uris: vscode.TextDocumentIdentifier[] = [];
		const getPaths = (node: any, prefix: string) => {
			if (typeof node === 'string') {
				uris.push({ uri: path2uri('', prefix + '/' + node) });
			} else {
				for (const key of Object.keys(node)) {
					getPaths(node[key], prefix + '/' + key);
				}
			}
		};
		getPaths(node, '');
		return uris;
	});

	connection.onRequest({ method: 'textDocument/xcontent' }, (params: vscode.TextDocumentIdentifier): { text: string } => {
		const file = uri2path(params.uri).substring(1);
		const segments = file.length > 0 ? file.split('/') : [];
		let node = memfs;
		// Find file
		for (const segment of segments) {
			if (!node || typeof node !== 'object') {
				throw new Error('No such directory: ' + file);
			}
			node = node[segment];
		}
		if (typeof node !== 'string') {
			throw new Error('No such file: ' + params.uri);
		}
		return { text: node };
	});
}

export function tearDown(done: () => void) {
	channel.clientConnection.sendRequest(rt.ShutdownRequest.type).then(() => {
		channel.clientConnection.sendNotification(rt.ExitRequest.type);
		channel.client.close();
		channel.server.close();
		channel = undefined;
		done();
	}, (e: any) => {
		console.error("error on tearDown:", e);
	});
}

function check(done: (err?: Error) => void, conditions: () => void) {
	try {
		conditions();
		done();
	} catch (err) {
		done(err);
	}
}

export function definition(pos: vscode.TextDocumentPositionParams, expected: vscode.Location | vscode.Location[] | null, done: (err?: Error) => void) {
	channel.clientConnection.sendRequest(rt.DefinitionRequest.type, {
		textDocument: {
			uri: pos.textDocument.uri
		},
		position: {
			line: pos.position.line,
			character: pos.position.character
		}
	}).then((results: vscode.Location[]) => {
		expected = expected ? (Array.isArray(expected) ? expected : [expected]) : null;
		check(done, () => {
			chai.expect(results).to.deep.equal(expected);
		});
	}, (err?: Error) => {
		return done(err || new Error('definition request failed'))
	})
}

export function xdefinition(pos: vscode.TextDocumentPositionParams, expected: rt.SymbolLocationInformation | rt.SymbolLocationInformation[] | null, done: (err?: Error) => void) {
	channel.clientConnection.sendRequest(rt.XdefinitionRequest.type, {
		textDocument: {
			uri: pos.textDocument.uri
		},
		position: {
			line: pos.position.line,
			character: pos.position.character
		}
	}).then((results: rt.SymbolLocationInformation[]) => {
		expected = expected ? (Array.isArray(expected) ? expected : [expected]) : null;
		check(done, () => {
			chai.expect(results).to.deep.equal(expected);
		});
	}, (err?: Error) => {
		return done(err || new Error('definition request failed'))
	})
}

export function hover(pos: vscode.TextDocumentPositionParams, expected: vscode.Hover, done: (err?: Error) => void) {
	channel.clientConnection.sendRequest(rt.HoverRequest.type, {
		textDocument: {
			uri: pos.textDocument.uri
		},
		position: {
			line: pos.position.line,
			character: pos.position.character
		}
	}).then((result: vscode.Hover) => {
		check(done, () => {
			chai.expect(result.contents).to.deep.equal(expected.contents);
		});
	}, (err?: Error) => {
		return done(err || new Error('hover request failed'))
	})
}

export function references(params: vscode.ReferenceParams, expected: number, done: (err?: Error) => void) {
	channel.clientConnection.sendRequest(rt.ReferencesRequest.type, params).then((result: vscode.Location[]) => {
		check(done, () => {
			chai.expect(result.length).to.equal(expected);
		});
	}, (err?: Error) => {
		return done(err || new Error('textDocument/references request failed'))
	})
}

export function workspaceReferences(params: rt.WorkspaceReferenceParams, expected: rt.ReferenceInformation[], done: (err?: Error) => void) {
	channel.clientConnection.sendRequest(rt.WorkspaceReferenceRequest.type, params).then((result: rt.ReferenceInformation[]) => {
		check(done, () => {
			chai.expect(result).to.deep.equal(expected);
		});
	}, (err?: Error) => {
		return done(err || new Error('workspace/xreferences request failed'))
	})
}

export function packages(expected: rt.PackageInformation[], done: (err?: Error) => void) {
	channel.clientConnection.sendRequest(rt.PackagesRequest.type).then((result: rt.PackageInformation[]) => {
		check(done, () => {
			chai.expect(result).to.deep.equal(expected);
		});
	}, (err?: Error) => {
		return done(err || new Error('packages request failed'))
	})
}

export function dependencies(expected: rt.DependencyReference[], done: (err?: Error) => void) {
	channel.clientConnection.sendRequest(rt.DependenciesRequest.type).then((result: rt.DependencyReference[]) => {
		check(done, () => {
			chai.expect(result).to.deep.equal(expected);
		});
	}, (err?: Error) => {
		return done(err || new Error('dependencies request failed'))
	})
}

export function symbols(params: rt.WorkspaceSymbolParams, expected: vscode.SymbolInformation[], done: (err?: Error) => void) {
	channel.clientConnection.sendRequest(rt.WorkspaceSymbolsRequest.type, params).then((result: vscode.SymbolInformation[]) => {
		check(done, () => {
			chai.expect(result).to.deep.equal(expected);
		});
	}, (err?: Error) => {
		return done(err || new Error('workspace/symbol request failed'))
	})
}

export function documentSymbols(params: vscode.DocumentSymbolParams, expected: vscode.SymbolInformation[], done: (err?: Error) => void) {
	channel.clientConnection.sendRequest(rt.DocumentSymbolRequest.type, params).then((result: vscode.SymbolInformation[]) => {
		check(done, () => {
			chai.expect(result).to.deep.equal(expected);
		});
	}, (err?: Error) => {
		return done(err || new Error('textDocument/documentSymbol request failed'))
	})
}

export function open(uri: string, text: string) {
	channel.clientConnection.sendNotification(rt.TextDocumentDidOpenNotification.type, {
		textDocument: {
			uri: uri,
			languageId: "",
			version: 0,
			text: text
		}
	});
}

export function close(uri: string) {
	channel.clientConnection.sendNotification(rt.TextDocumentDidCloseNotification.type, {
		textDocument: {
			uri: uri,
		}
	});
}

export function change(uri: string, text: string) {
	channel.clientConnection.sendNotification(rt.TextDocumentDidChangeNotification.type, {
		textDocument: {
			uri: uri,
			version: 0,
		}, contentChanges: [{
			text: text
		}]
	});
}

export function completions(params: vscode.TextDocumentPositionParams, expected: vscode.CompletionItem[], done: (err?: Error) => void) {
	const cmp = (a: vscode.CompletionItem, b: vscode.CompletionItem) => a.label.localeCompare(b.label);
	channel.clientConnection.sendRequest(rt.TextDocumentCompletionRequest.type, params).then((result: vscode.CompletionList) => {
		check(done, () => {
			chai.assert(result);
			chai.assert(result.items);
			result.items.sort(cmp);
			if (expected) {
				chai.expect(result.items).to.deep.equal(expected.sort(cmp));
			} else {
				chai.expect(result.items.length).to.not.equal(0);
			}
		});
	}, (err?: Error) => {
		return done(err || new Error('textDocument/completion request failed'))
	})
}
