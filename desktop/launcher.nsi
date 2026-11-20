Unicode true
!ifndef APP_VERSION
  !define APP_VERSION "1.0.0"
!endif
!ifndef BUILD_DIR
  !error "Pass BUILD_DIR from build_windows.py"
!endif
Name "Rentbook Desktop"
OutFile "${BUILD_DIR}/Rentbook.exe"
RequestExecutionLevel user
ManifestSupportedOS "Win10"
ManifestDPIAware true
SilentInstall silent
AutoCloseWindow true
SetCompressor /SOLID lzma
Icon "assets/rentbook.ico"
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName" "Rentbook Desktop"
VIAddVersionKey "FileDescription" "Rentbook Desktop Launcher"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "CompanyName" "Filezuno"
VIAddVersionKey "LegalCopyright" "Filezuno"
!include "browser.nsh"
Section
  Call OpenRentbook
SectionEnd
