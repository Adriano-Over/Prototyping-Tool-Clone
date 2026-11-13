#include <winsock2.h>
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <ws2tcpip.h>
#include <wrl.h>
#include <WebView2.h>
#include <filesystem>
#include <string>

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "ws2_32.lib")

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;
namespace fs = std::filesystem;

namespace {
constexpr wchar_t kClassName[] = L"FormaDesktopWindow";
constexpr wchar_t kAppUrl[] = L"http://127.0.0.1:5187/";
HWND gWindow{};
ComPtr<ICoreWebView2Controller> gController;
ComPtr<ICoreWebView2> gWebView;
PROCESS_INFORMATION gServer{};
HANDLE gServerJob{};
HANDLE gInstanceMutex{};
bool gStartedServer = false;

fs::path ExecutableDirectory() {
  std::wstring path(32768, L'\0');
  const DWORD size = GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
  path.resize(size);
  return fs::path(path).parent_path();
}

fs::path FindProjectRoot() {
  fs::path candidate = ExecutableDirectory();
  for (int depth = 0; depth < 9; ++depth) {
    if (fs::exists(candidate / L"server.mjs") && fs::exists(candidate / L"dist" / L"index.html")) return candidate;
    if (!candidate.has_parent_path()) break;
    candidate = candidate.parent_path();
  }
  return {};
}

bool PortIsReady() {
  SOCKET socketHandle = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (socketHandle == INVALID_SOCKET) return false;
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(5187);
  inet_pton(AF_INET, "127.0.0.1", &address.sin_addr);
  const bool connected = connect(socketHandle, reinterpret_cast<sockaddr*>(&address), sizeof(address)) == 0;
  closesocket(socketHandle);
  return connected;
}

bool AcquireSingleInstance() {
  gInstanceMutex = CreateMutexW(nullptr, FALSE, L"Local\\FormaDesktop.Singleton");
  if (!gInstanceMutex) {
    MessageBoxW(nullptr, L"Forma could not reserve its desktop session.", L"Forma", MB_OK | MB_ICONERROR);
    return false;
  }
  if (GetLastError() != ERROR_ALREADY_EXISTS) return true;

  HWND existing{};
  for (int attempt = 0; attempt < 20 && !existing; ++attempt) {
    existing = FindWindowW(kClassName, nullptr);
    if (!existing) Sleep(100);
  }
  if (existing) {
    if (IsIconic(existing)) ShowWindow(existing, SW_RESTORE);
    SetForegroundWindow(existing);
  }
  CloseHandle(gInstanceMutex);
  gInstanceMutex = nullptr;
  return false;
}

void StopLocalServer();

bool StartLocalServer(const fs::path& root) {
  if (PortIsReady()) return true;
  gServerJob = CreateJobObjectW(nullptr, nullptr);
  if (!gServerJob) return false;
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!SetInformationJobObject(gServerJob, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
    CloseHandle(gServerJob);
    gServerJob = nullptr;
    return false;
  }
  fs::path node = root / L"runtime" / L"node.exe";
  if (!fs::exists(node)) node = root / L"desktop" / L"runtime" / L"node.exe";
  std::wstring executable = fs::exists(node) ? node.wstring() : L"node.exe";
  std::wstring command = L"\"" + executable + L"\" \"" + (root / L"server.mjs").wstring() + L"\" 5187";
  STARTUPINFOW startup{};
  startup.cb = sizeof(startup);
  startup.dwFlags = STARTF_USESHOWWINDOW;
  startup.wShowWindow = SW_HIDE;
  if (!CreateProcessW(nullptr, command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW | CREATE_SUSPENDED, nullptr, root.c_str(), &startup, &gServer)) {
    CloseHandle(gServerJob);
    gServerJob = nullptr;
    return false;
  }
  if (!AssignProcessToJobObject(gServerJob, gServer.hProcess)) {
    TerminateProcess(gServer.hProcess, 1);
    WaitForSingleObject(gServer.hProcess, 3000);
    CloseHandle(gServer.hThread);
    CloseHandle(gServer.hProcess);
    gServer = {};
    CloseHandle(gServerJob);
    gServerJob = nullptr;
    return false;
  }
  gStartedServer = true;
  if (ResumeThread(gServer.hThread) == static_cast<DWORD>(-1)) {
    StopLocalServer();
    return false;
  }
  for (int attempt = 0; attempt < 80; ++attempt) {
    if (PortIsReady()) return true;
    if (WaitForSingleObject(gServer.hProcess, 0) == WAIT_OBJECT_0) {
      StopLocalServer();
      return false;
    }
    Sleep(100);
  }
  StopLocalServer();
  return false;
}

void StopLocalServer() {
  if (gServerJob && gStartedServer) {
    TerminateJobObject(gServerJob, 0);
    if (gServer.hProcess) WaitForSingleObject(gServer.hProcess, 5000);
  }
  if (gServerJob) CloseHandle(gServerJob);
  if (gServer.hThread) CloseHandle(gServer.hThread);
  if (gServer.hProcess) CloseHandle(gServer.hProcess);
  gServerJob = nullptr;
  gServer = {};
  gStartedServer = false;
}

void ResizeWebView() {
  if (!gController || !gWindow) return;
  RECT bounds{};
  GetClientRect(gWindow, &bounds);
  gController->put_Bounds(bounds);
}

std::wstring UserDataDirectory() {
  PWSTR localAppData{};
  if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &localAppData))) return (ExecutableDirectory() / L"userdata").wstring();
  fs::path result = fs::path(localAppData) / L"Forma" / L"WebView2";
  CoTaskMemFree(localAppData);
  fs::create_directories(result);
  return result.wstring();
}

void CreateEditorWebView() {
  const std::wstring userData = UserDataDirectory();
  HRESULT result = CreateCoreWebView2EnvironmentWithOptions(nullptr, userData.c_str(), nullptr,
    Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
      [](HRESULT environmentResult, ICoreWebView2Environment* environment) -> HRESULT {
        if (FAILED(environmentResult) || !environment) {
          MessageBoxW(gWindow, L"Microsoft Edge WebView2 Runtime is required to run Forma.", L"Forma", MB_OK | MB_ICONERROR);
          return environmentResult;
        }
        return environment->CreateCoreWebView2Controller(gWindow,
          Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
            [](HRESULT controllerResult, ICoreWebView2Controller* controller) -> HRESULT {
              if (FAILED(controllerResult) || !controller) return controllerResult;
              gController = controller;
              gController->get_CoreWebView2(&gWebView);
              ComPtr<ICoreWebView2Settings> settings;
              gWebView->get_Settings(&settings);
              settings->put_IsStatusBarEnabled(FALSE);
              settings->put_AreDefaultContextMenusEnabled(TRUE);
              settings->put_AreDevToolsEnabled(TRUE);
              settings->put_IsZoomControlEnabled(FALSE);
              gWebView->add_NewWindowRequested(Callback<ICoreWebView2NewWindowRequestedEventHandler>(
                [](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* args) -> HRESULT {
                  LPWSTR uri{};
                  args->get_Uri(&uri);
                  if (uri) {
                    ShellExecuteW(nullptr, L"open", uri, nullptr, nullptr, SW_SHOWNORMAL);
                    CoTaskMemFree(uri);
                  }
                  args->put_Handled(TRUE);
                  return S_OK;
                }).Get(), nullptr);
              ResizeWebView();
              gController->put_IsVisible(TRUE);
              return gWebView->Navigate(kAppUrl);
            }).Get());
      }).Get());
  if (FAILED(result)) MessageBoxW(gWindow, L"Forma could not initialize its desktop rendering surface.", L"Forma", MB_OK | MB_ICONERROR);
}

LRESULT CALLBACK WindowProcedure(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
  switch (message) {
    case WM_SIZE: ResizeWebView(); return 0;
    case WM_SETFOCUS: if (gController) gController->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC); return 0;
    case WM_CLOSE: DestroyWindow(window); return 0;
    case WM_DESTROY: if(gController)gController->Close();gWebView.Reset();gController.Reset();StopLocalServer();PostQuitMessage(0);return 0;
    default: return DefWindowProcW(window, message, wParam, lParam);
  }
}
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int showCommand) {
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  if (FAILED(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED))) return 1;
  if (!AcquireSingleInstance()) { CoUninitialize(); return 0; }
  WSADATA sockets{};WSAStartup(MAKEWORD(2, 2), &sockets);
  const fs::path root = FindProjectRoot();
  if (root.empty()) {MessageBoxW(nullptr, L"Forma could not find server.mjs and the dist folder. Keep the desktop executable inside the Forma project.", L"Forma", MB_OK | MB_ICONERROR);return 2;}
  if (!StartLocalServer(root)) {MessageBoxW(nullptr, L"Forma could not start its local project service. Install Node.js or run desktop\\build.ps1 to bundle the current Node runtime.", L"Forma", MB_OK | MB_ICONERROR);return 3;}
  WNDCLASSEXW windowClass{sizeof(WNDCLASSEXW)};
  windowClass.style=CS_HREDRAW|CS_VREDRAW;windowClass.lpfnWndProc=WindowProcedure;windowClass.hInstance=instance;windowClass.hCursor=LoadCursor(nullptr,IDC_ARROW);windowClass.hIcon=LoadIcon(nullptr,IDI_APPLICATION);windowClass.hbrBackground=reinterpret_cast<HBRUSH>(COLOR_WINDOW+1);windowClass.lpszClassName=kClassName;
  RegisterClassExW(&windowClass);
  gWindow=CreateWindowExW(0,kClassName,L"Forma - Design Workspace",WS_OVERLAPPEDWINDOW,CW_USEDEFAULT,CW_USEDEFAULT,1440,920,nullptr,nullptr,instance,nullptr);
  if (!gWindow) return 4;
  ShowWindow(gWindow,showCommand);UpdateWindow(gWindow);CreateEditorWebView();
  MSG message{};while(GetMessageW(&message,nullptr,0,0)){TranslateMessage(&message);DispatchMessageW(&message);}
  WSACleanup();if(gInstanceMutex){CloseHandle(gInstanceMutex);gInstanceMutex=nullptr;}CoUninitialize();return static_cast<int>(message.wParam);
}
