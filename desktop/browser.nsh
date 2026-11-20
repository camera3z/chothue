; Shared by the installer and the small desktop launcher.
; Never use a URL/command supplied by the user or copy browser profile data.
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
Var BrowserPath

!macro TryBrowserRegistry ROOT NAME
  ReadRegStr $BrowserPath ${ROOT} "Software\Microsoft\Windows\CurrentVersion\App Paths\${NAME}" ""
  IfFileExists "$BrowserPath" browser_found
!macroend

Function FindBrowser
  ; Prefer Chrome, matching the existing Rentbook PC workflow; fall back to Edge.
  ${If} ${RunningX64}
    SetRegView 64
    !insertmacro TryBrowserRegistry HKCU "chrome.exe"
    !insertmacro TryBrowserRegistry HKLM "chrome.exe"
  ${EndIf}
  SetRegView 32
  !insertmacro TryBrowserRegistry HKCU "chrome.exe"
  !insertmacro TryBrowserRegistry HKLM "chrome.exe"
  StrCpy $BrowserPath "$LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  IfFileExists "$BrowserPath" browser_found
  StrCpy $BrowserPath "$PROGRAMFILES64\Google\Chrome\Application\chrome.exe"
  IfFileExists "$BrowserPath" browser_found
  StrCpy $BrowserPath "$PROGRAMFILES32\Google\Chrome\Application\chrome.exe"
  IfFileExists "$BrowserPath" browser_found
  ${If} ${RunningX64}
    SetRegView 64
    !insertmacro TryBrowserRegistry HKCU "msedge.exe"
    !insertmacro TryBrowserRegistry HKLM "msedge.exe"
  ${EndIf}
  SetRegView 32
  !insertmacro TryBrowserRegistry HKCU "msedge.exe"
  !insertmacro TryBrowserRegistry HKLM "msedge.exe"
  StrCpy $BrowserPath "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
  IfFileExists "$BrowserPath" browser_found
  StrCpy $BrowserPath "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe"
  IfFileExists "$BrowserPath" browser_found
  StrCpy $BrowserPath "$LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
  IfFileExists "$BrowserPath" browser_found
  StrCpy $BrowserPath ""
browser_found:
  SetRegView 32
FunctionEnd

Function OpenRentbook
  Call FindBrowser
  ${If} $BrowserPath == ""
    MessageBox MB_OK|MB_ICONINFORMATION "Rentbook cần Google Chrome hoặc Microsoft Edge trên máy để mở cửa sổ ứng dụng. Hãy cài một trong hai trình duyệt rồi mở lại Rentbook."
    Return
  ${EndIf}
  ClearErrors
  Exec '"$BrowserPath" --app="https://thue.filezuno.net/"'
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "Chưa mở được Rentbook. Hãy kiểm tra Chrome hoặc Edge rồi thử lại."
  ${EndIf}
FunctionEnd
