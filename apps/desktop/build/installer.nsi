Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"

!ifndef APP_VERSION
  !error "APP_VERSION is required"
!endif
!ifndef APP_SOURCE
  !error "APP_SOURCE is required"
!endif
!ifndef INSTALLER_OUTPUT
  !error "INSTALLER_OUTPUT is required"
!endif

Name "JaxOS"
OutFile "${INSTALLER_OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\JaxOS"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 32
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "JaxOS"
VIAddVersionKey /LANG=1033 "FileDescription" "JaxOS personal installer (unsigned)"
VIAddVersionKey /LANG=1033 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "JaxOS"

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "Install JaxOS ${APP_VERSION} for your Windows account.$\r$\n$\r$\nThis is an unsigned personal build. It installs to your local Programs folder without administrator access.$\r$\n$\r$\nClose JaxOS before installing an update. Your saved conversations and settings are preserved."
!define MUI_FINISHPAGE_RUN "$INSTDIR\JaxOS.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open JaxOS"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  SetShellVarContext current
  ; Keep the program directory fixed so upgrades cannot erase a user-chosen folder.
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\JaxOS"
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "This JaxOS build requires 64-bit Windows."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "This JaxOS build requires Windows 10 or later."
    Abort
  ${EndIf}
  SetRegView 64
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\JaxOS.PersonalInstaller") p .r0 ?e'
  Pop $1
  ${If} $1 = 183
    MessageBox MB_ICONSTOP "Another JaxOS installer is already running."
    Abort
  ${EndIf}
FunctionEnd

Function EnsureAppClosed
  check:
  IfFileExists "$INSTDIR\JaxOS.exe" 0 done
  ClearErrors
  FileOpen $0 "$INSTDIR\JaxOS.exe" a
  ${If} ${Errors}
    ${If} ${Silent}
      SetErrorLevel 2
      Quit
    ${EndIf}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Close JaxOS before continuing. If it is already closed, check that this folder is writable." IDRETRY check
    Abort
  ${EndIf}
  FileClose $0
  done:
FunctionEnd

Section "Install"
  Call EnsureAppClosed
  SetOutPath "$INSTDIR"
  ; Remove only a prior JaxOS installation, never application data in AppData.
  IfFileExists "$INSTDIR\Uninstall JaxOS.exe" 0 copy_files
  IfFileExists "$INSTDIR\resources\app.asar" 0 copy_files
  RMDir /r "$INSTDIR\resources"
  copy_files:
  SetOverwrite on
  File /r "${APP_SOURCE}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall JaxOS.exe"
  CreateDirectory "$SMPROGRAMS\JaxOS"
  CreateShortcut "$SMPROGRAMS\JaxOS\JaxOS.lnk" "$INSTDIR\JaxOS.exe"
  CreateShortcut "$DESKTOP\JaxOS.lnk" "$INSTDIR\JaxOS.exe"
  WriteRegStr HKCU "Software\JaxOS" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JaxOS" "DisplayName" "JaxOS"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JaxOS" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JaxOS" "Publisher" "JaxOS"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JaxOS" "DisplayIcon" "$INSTDIR\JaxOS.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JaxOS" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JaxOS" "UninstallString" '$\"$INSTDIR\Uninstall JaxOS.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JaxOS" "QuietUninstallString" '$\"$INSTDIR\Uninstall JaxOS.exe$\" /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JaxOS" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JaxOS" "NoRepair" 1
SectionEnd

Function un.onInit
  SetShellVarContext current
  SetRegView 64
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\JaxOS.PersonalInstaller") p .r0 ?e'
  Pop $1
  ${If} $1 = 183
    MessageBox MB_ICONSTOP "Another JaxOS installer is already running."
    Abort
  ${EndIf}
  ${If} $INSTDIR != "$LOCALAPPDATA\Programs\JaxOS"
    MessageBox MB_ICONSTOP "Run the uninstaller from the JaxOS installation folder."
    Abort
  ${EndIf}
  check:
  IfFileExists "$INSTDIR\JaxOS.exe" 0 done
  ClearErrors
  FileOpen $0 "$INSTDIR\JaxOS.exe" a
  ${If} ${Errors}
    ${If} ${Silent}
      SetErrorLevel 2
      Quit
    ${EndIf}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Close JaxOS before uninstalling." IDRETRY check
    Abort
  ${EndIf}
  FileClose $0
  done:
FunctionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\JaxOS\JaxOS.lnk"
  RMDir "$SMPROGRAMS\JaxOS"
  Delete "$DESKTOP\JaxOS.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JaxOS"
  DeleteRegKey HKCU "Software\JaxOS"
  ; Deliberately preserve Electron's userData directory (conversations/settings).
SectionEnd
