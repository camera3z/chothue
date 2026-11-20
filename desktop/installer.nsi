Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"
!include "browser.nsh"
!ifndef APP_VERSION
  !define APP_VERSION "1.0.0"
!endif
!ifndef BUILD_DIR
  !error "Pass BUILD_DIR from build_windows.py"
!endif
!define APP_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\FilezunoRentbookDesktop"
Name "Rentbook Desktop"
OutFile "${BUILD_DIR}/RentbookSetup.exe"
InstallDir "$LOCALAPPDATA\Programs\Filezuno\Rentbook"
RequestExecutionLevel user
ManifestSupportedOS "Win10"
ManifestDPIAware true
SetOverwrite on
ShowInstDetails show
ShowUninstDetails show
BrandingText "Filezuno · Rentbook"
!define MUI_ICON "assets/rentbook.ico"
!define MUI_UNICON "assets/rentbook.ico"
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName" "Rentbook Desktop Setup"
VIAddVersionKey "FileDescription" "Rentbook Desktop Installer"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "CompanyName" "Filezuno"
VIAddVersionKey "LegalCopyright" "Filezuno"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Cài đặt Rentbook Desktop"
!define MUI_WELCOMEPAGE_TEXT "Cài Rentbook vào tài khoản Windows của bạn và tạo biểu tượng để mở ứng dụng trong cửa sổ riêng.$\r$\n$\r$\nRentbook cần Internet và dùng Chrome hoặc Edge có trên máy. Đăng nhập bằng tài khoản Filezuno hoặc email hiện tại để tiếp tục dùng dữ liệu và bản quyền của bạn.$\r$\n$\r$\nBộ cài không chứa dữ liệu cửa hàng hoặc key bản quyền."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION OpenRentbook
!define MUI_FINISHPAGE_RUN_TEXT "Mở Rentbook"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Vietnamese"

Function .onInit
  SetShellVarContext current
  ; Fixed per-user directory; ignore /D= overrides and do not ask for admin.
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Filezuno\Rentbook"
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONINFORMATION "Rentbook Desktop hỗ trợ Windows 10 và Windows 11."
    Abort
  ${EndIf}
  Call FindBrowser
  ${If} $BrowserPath == ""
    MessageBox MB_OK|MB_ICONINFORMATION "Cần Google Chrome hoặc Microsoft Edge để chạy Rentbook Desktop. Hãy cài trình duyệt rồi chạy lại bộ cài."
    Abort
  ${EndIf}
FunctionEnd

Section "Rentbook Desktop" SEC_MAIN
  SetShellVarContext current
  SetRegView 32
  SetOutPath "$INSTDIR"
  File "${BUILD_DIR}/Rentbook.exe"
  File /oname=rentbook.ico "assets/rentbook.ico"
  File /oname=HUONG-DAN.txt "WINDOWS-USER.txt"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Filezuno\Rentbook Desktop"
  CreateShortCut "$SMPROGRAMS\Filezuno\Rentbook Desktop\Rentbook Desktop.lnk" "$INSTDIR\Rentbook.exe" "" "$INSTDIR\rentbook.ico"
  CreateShortCut "$SMPROGRAMS\Filezuno\Rentbook Desktop\Gỡ Rentbook Desktop.lnk" "$INSTDIR\Uninstall.exe"
  ; A distinct name keeps an existing browser-installed PWA shortcut intact.
  CreateShortCut "$DESKTOP\Rentbook Desktop.lnk" "$INSTDIR\Rentbook.exe" "" "$INSTDIR\rentbook.ico"
  WriteRegStr HKCU "${APP_KEY}" "DisplayName" "Rentbook Desktop"
  WriteRegStr HKCU "${APP_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${APP_KEY}" "Publisher" "Filezuno"
  WriteRegStr HKCU "${APP_KEY}" "URLInfoAbout" "https://filezuno.net"
  WriteRegStr HKCU "${APP_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${APP_KEY}" "DisplayIcon" "$INSTDIR\rentbook.ico"
  WriteRegStr HKCU "${APP_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "${APP_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${APP_KEY}" "NoRepair" 1
SectionEnd

Function un.onInit
  SetShellVarContext current
  SetRegView 32
  ; Never remove another directory, even if the uninstaller is copied/moved.
  StrCmp $INSTDIR "$LOCALAPPDATA\Programs\Filezuno\Rentbook" path_ok
  MessageBox MB_OK|MB_ICONEXCLAMATION "Không xác định đúng thư mục Rentbook Desktop. Hãy gỡ ứng dụng từ Settings của Windows."
  Abort
path_ok:
FunctionEnd

Section "Uninstall"
  Delete "$DESKTOP\Rentbook Desktop.lnk"
  Delete "$SMPROGRAMS\Filezuno\Rentbook Desktop\Rentbook Desktop.lnk"
  Delete "$SMPROGRAMS\Filezuno\Rentbook Desktop\Gỡ Rentbook Desktop.lnk"
  RMDir "$SMPROGRAMS\Filezuno\Rentbook Desktop"
  RMDir "$SMPROGRAMS\Filezuno"
  Delete "$INSTDIR\Rentbook.exe"
  Delete "$INSTDIR\rentbook.ico"
  Delete "$INSTDIR\HUONG-DAN.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${APP_KEY}"
SectionEnd
