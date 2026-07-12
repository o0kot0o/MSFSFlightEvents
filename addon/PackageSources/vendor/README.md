# vendor/

`microsoft-msfs-sdk-2.1.1.tgz` goes here — it's Microsoft's own `@microsoft/msfs-sdk` package,
not published to the public npm registry, so it can't be installed with a normal `npm install`.
It isn't included in this repo (see `addon/.gitignore`) since it's Microsoft's SDK package, not
ours to redistribute.

To build this project, copy it in from your own local MSFS 2024 SDK install:

```
C:\MSFS 2024 SDK\Samples\DevmodeProjects\EFB\...\vendor\microsoft-msfs-sdk-2.1.1.tgz
```

(Exact path may vary by SDK version — search your SDK install for a file matching
`microsoft-msfs-sdk-*.tgz` if the version has moved on.)
