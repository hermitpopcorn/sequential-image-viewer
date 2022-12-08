# Sequential Image Viewer

## What and why

Shows an image inside a webview, maximized to its width. But more importantly, there's also left and right arrow buttons to switch the image to another image in the same folder, sequentially ordered by filename.

Sometimes I do things like translating images or make edits following instructions in some image file and I want to view those series of images in a side panel. Pulling other image files from the explorer tree to that panel is a hassle every time so I figure I'll let a chevron arrow button do the job for me this time.

This extension considers the following formats to be image files: ```.png, jpg, jpeg, gif, svg, webp, bmp```. I haven't tested for them all, though 😅

## Build
```yarn install``` to install dependencies and then ```./node_modules/@vscode/vsce/vsce package --no-yarn``` to make it into a VSIX package (```--no-yarn``` for now because I migrated this to yarn berry and I didn't know that breaks vsce).