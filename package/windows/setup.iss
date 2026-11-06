#define AppVersion "0.2.15"

[Setup]
AppId=Kesev.UserV1
AppName=Kesev
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\Kesev
DefaultGroupName=Kesev
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
MinVersion=10.0.19045
OutputBaseFilename=Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Kesev

[Files]
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Kesev"; Filename: "{app}\runtime\node.exe"; Parameters: """{app}\launcher\launch.mjs"""; WorkingDir: "{app}"
Name: "{group}\Uninstall Kesev"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\runtime\node.exe"; Parameters: """{app}\launcher\launch.mjs"""; WorkingDir: "{app}"; Description: "Launch Kesev"; Flags: nowait postinstall skipifsilent
