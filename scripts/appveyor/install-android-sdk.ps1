$AndroidToolPath = "${env:ProgramFiles(x86)}\Android\android-sdk\tools\android.bat"
if(-not (Test-Path $AndroidToolPath)) {
    $AndroidToolPath = "$env:localappdata\Android\android-sdk\tools\android.bat"
}

Function Get-AllAndroidSDKs() {
    $output = & $AndroidToolPath list sdk --all
    $sdks = $output |% {
        if ($_ -match '(?<index>\d+)- (?<sdk>.+), revision (?<revision>[\d\.]+)') {
            $sdk = New-Object PSObject
            Add-Member -InputObject $sdk -MemberType NoteProperty -Name Index -Value $Matches.index
            Add-Member -InputObject $sdk -MemberType NoteProperty -Name Name -Value $Matches.sdk
            Add-Member -InputObject $sdk -MemberType NoteProperty -Name Revision -Value $Matches.revision
            $sdk
        }
    }
    $sdks
}

Function Execute-AndroidSDKInstall() {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory=$true, Position=0)]
        [PSObject[]]$sdks
    )

    $sdkIndexes = $sdks |% { $_.Index }
    $sdkIndexArgument = [string]::Join(',', $sdkIndexes)
    Echo 'y' | & $AndroidToolPath update sdk -u -a -t $sdkIndexArgument
}

Function Install-AndroidSDK
{
    param([string]$Level)

    $sdks = Get-AllAndroidSDKs |? { $_.name -like "sdk platform*API $Level*" -or $_.name -like "google apis*api $Level" }
    Execute-AndroidSDKInstall -sdks $sdks
}

Install-AndroidSDK 27
