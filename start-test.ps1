Set-Location 'C:\Users\Hrana\OneDrive\MiaSoft\tourit'

Start-Process -FilePath 'C:\Windows\System32\cmd.exe' -ArgumentList '/k', 'C:\Users\Hrana\OneDrive\MiaSoft\tourit\launch_backend.cmd' -WindowStyle Normal

Start-Process -FilePath 'C:\Windows\System32\cmd.exe' -ArgumentList '/k', 'C:\Users\Hrana\OneDrive\MiaSoft\tourit\launch_frontend.cmd' -WindowStyle Normal
