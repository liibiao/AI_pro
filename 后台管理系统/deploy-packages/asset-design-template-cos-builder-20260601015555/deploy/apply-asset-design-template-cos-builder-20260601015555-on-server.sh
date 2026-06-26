#!/usr/bin/env bash
set -euo pipefail

echo "这是构建包，不是最终部署包。"
echo "请先在本机补齐 01.jpg 到 17.jpg，并运行："
echo "cd \"/Users/billy/Documents/AI_pro/漫剧创作库\""
echo "./tools/package_asset_design_templates_after_refs.sh"
echo "该脚本会输出 /tmp/asset-design-template-cos-final-*.tar.gz，那个才是最终部署包。"
exit 2
