#!/bin/bash

# Source is already fixed as per previous run (it is now a valid PNG)
# Only regenerate icons

echo "Regenerating icons..."

# mdpi: 48
echo "Processing mdpi..."
sips -z 48 48 "src/assets/logo.png" --out "android/app/src/main/res/mipmap-mdpi/ic_launcher.png"
sips -z 48 48 "src/assets/logo.png" --out "android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png"

# hdpi: 72
echo "Processing hdpi..."
sips -z 72 72 "src/assets/logo.png" --out "android/app/src/main/res/mipmap-hdpi/ic_launcher.png"
sips -z 72 72 "src/assets/logo.png" --out "android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png"

# xhdpi: 96
echo "Processing xhdpi..."
sips -z 96 96 "src/assets/logo.png" --out "android/app/src/main/res/mipmap-xhdpi/ic_launcher.png"
sips -z 96 96 "src/assets/logo.png" --out "android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png"

# xxhdpi: 144
echo "Processing xxhdpi..."
sips -z 144 144 "src/assets/logo.png" --out "android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png"
sips -z 144 144 "src/assets/logo.png" --out "android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png"

# xxxhdpi: 192
echo "Processing xxxhdpi..."
sips -z 192 192 "src/assets/logo.png" --out "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"
sips -z 192 192 "src/assets/logo.png" --out "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png"

echo "Icon regeneration complete!"
