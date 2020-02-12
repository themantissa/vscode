import * as vscode from 'vscode';

import { createLogger } from './logging';
import ConnectionController, { DataServiceEventTypes } from './connectionController';

const log = createLogger('change stream controller');

const STREAM_EVENT = 'STREAM_EVENT';
const dbToWatch = 'extension-tester';

function getChangeStreamWebviewContent() {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MongoDB Change Streams</title>
        <style>
          body {
            background-color: #E7EEEC;
            color: #061621;
          }

          h1 {
            color: #13AA52;
          }

          ul {
            list-style-type: none;
            margin: 20px;
            padding: 20px;
            padding-top: 0;
          }

          li {
            padding: 0;
            margin: 0;
            margin-bottom: 10px;
          }
        </style>
    </head>
    <body>
      <h1>MongoDB Change Stream view</h1>
      <ul id="changeStreamList">
        <li id="firstItemToRemove">Awaiting change stream events on database '${dbToWatch}'...</li>
      <ul>

      <script>
        let isFirstMessage = true;

        // Handle the message inside the webview.
        window.addEventListener('message', event => {
          const message = event.data; // The JSON data our extension sent

          switch (message.command) {
            case '${STREAM_EVENT}':
              if (isFirstMessage) {
                isFirstMessage = false;
                const oneToRemove = document.getElementById('firstItemToRemove');
                oneToRemove.remove();
              }

              const changeStreamList = document.getElementById('changeStreamList');
              const streamItem = document.createElement('li');

              changeStreamList.prepend(streamItem);
              const streamPreItem = document.createElement('pre');
              streamPreItem.innerHTML = JSON.stringify(message.eventData, null, 2);
              streamItem.appendChild(streamPreItem);

              break;
          }
        });
      </script>
    </body>
  </html>`;
}

export default class ChangeStreamController {
  private _connectionController: ConnectionController;
  private _webViewPanel: vscode.WebviewPanel | undefined = undefined;

  private _hasConnected: boolean = false;

  constructor(connectionController: ConnectionController) {
    this._connectionController = connectionController;

    this._connectionController.addEventListener(DataServiceEventTypes.CONNECTIONS_DID_CHANGE, this.onConnectionUpdate);
  }

  public openChangeStreamViewer(): Promise<boolean> {
    log.info('mdb.openChangeStream command called.');

    // Create and show a new connect dialogue webview.
    this._webViewPanel = vscode.window.createWebviewPanel(
      'changeStreamWebview',
      'MongoDB Change Streams', // Title
      vscode.ViewColumn.One, // Editor column to show the webview panel in.
      {
        enableScripts: true
      }
    );

    this._webViewPanel.webview.html = getChangeStreamWebviewContent();

    this.tryToOpenChangeStream();

    return Promise.resolve(true);
  }

  async registerChangeStreamWatchers() {
    // NOTE: This only works on replica sets.

    console.log('Registering change stream watchers...');
    const activeConnection = this._connectionController.getActiveConnection();
    const connectionClient = activeConnection.client;
    const clientDB = connectionClient._database(dbToWatch);

    const dbChangeStream = clientDB.watch();

    console.log(`Registered change stream watcher, now watching db "${dbToWatch}"...`);

    dbChangeStream.on('change', (changeStreamItem: any) => {
      if (this._webViewPanel) {
        this._webViewPanel.webview.postMessage({
          command: STREAM_EVENT,
          eventData: changeStreamItem
        });
      }
    });

    // let maxEventsCount = 0;
    // while (true) {
    //   const changeStreamItem = await dbWatcher.next();

    //   if (this._webViewPanel) {
    //     this._webViewPanel.webview.postMessage({
    //       command: STREAM_EVENT,
    //       eventData: changeStreamItem
    //     });

    //     if (maxEventsCount > 100) {
    //       console.log('Got max events. Ending watch.');
    //       break;
    //     }
    //   }
    // }
  }

  tryToOpenChangeStream = () => {
    if (this._connectionController.getActiveConnectionInstanceId() !== null) {
      // We are connected.
      if (!this._hasConnected) {
        this._hasConnected = true;
        this.registerChangeStreamWatchers();
      }
    }
  }

  onConnectionUpdate = () => {
    console.log('connection update');

    this.tryToOpenChangeStream();
  }
}
