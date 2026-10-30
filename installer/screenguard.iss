; ScreenGuard+ Inno Setup Script
; Generates ScreenGuardPlus-Setup.exe installer

#define MyAppName "ScreenGuard+"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "ScreenGuard+ Team"
#define MyAppURL "https://github.com/thinh082/ScreenGuardPlus_Nhom8_11TMDT"
#define MyAppExeName "ScreenGuardPlus.exe"

[Setup]
AppId={{C64923F4-98F1-44B9-A2EB-8B9079C3FE91}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\ScreenGuardPlus
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\dist
OutputBaseFilename=ScreenGuardPlus-Setup
SetupIconFile=..\frontend\icons\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequiredOverridesAllowed=dialog commandline
DisableProgramGroupPage=auto

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\ScreenGuardPlus\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\frontend\icons\app.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\frontend\icons\app.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  AppDataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    AppDataDir := ExpandConstant('{localappdata}\ScreenGuardPlus');
    if DirExists(AppDataDir) then
    begin
      if MsgBox('Bạn có muốn xóa dữ liệu cấu hình và cache cá nhân tại ' + AppDataDir + ' không?', mbConfirmation, MB_YESNO) = IDYES then
      begin
        DelTree(AppDataDir, True, True, True);
      end;
    end;
  end;
end;

