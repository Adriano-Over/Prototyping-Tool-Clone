# Forma Desktop (C++)

Forma Desktop is a native Windows application written in C++20. It creates a Win32 window, starts the local project service in the background, and embeds the editor through Microsoft Edge WebView2. This follows the same broad architecture used by high-performance desktop web applications: a native host around a web UI, with room for future C++/WebAssembly rendering modules.

Forma Desktop is single-instance. Its local service and any child processes it starts are grouped in a Windows job object and are terminated when the desktop window closes. The WebView2 controller is closed before the service is stopped.

## Build requirements

- Windows 10 or 11
- Visual Studio 2022 Build Tools with **Desktop development with C++**
- Microsoft Edge WebView2 Runtime
- PowerShell and Node.js

Run `.\desktop\build.ps1` from the project folder. The executable is created at `desktop/bin/x64/Release/Forma.exe`. The build copies the current Node runtime into `desktop/runtime`, and the executable locates `server.mjs`, `dist`, and `GrapesJS` automatically.

The build restores Microsoft's official WebView2 C++ SDK from NuGet. Project data remains in `GrapesJS/projects`, and AI reconstruction bundles remain in `GrapesJS/exports`.
