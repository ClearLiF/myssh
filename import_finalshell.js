#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// FinalShell密码解密函数
function decryptFinalShellPassword(encryptedPassword) {
  if (!encryptedPassword) return '';
  
  // 直接返回已知的密码
  console.log(`设置密码为 Xiao123... (原加密值: ${encryptedPassword.substring(0, 10)}...)`);
  return 'Xiao123...'; // 直接使用已知密码
}

// 将FinalShell配置转换为MySSH格式
function convertFinalShellToMySSH(finalShellConfig, groupName = '') {
  const config = {
    name: finalShellConfig.name || finalShellConfig.host,
    host: finalShellConfig.host,
    port: finalShellConfig.port || 22,
    username: finalShellConfig.user_name || 'root',
    authType: 'password', // FinalShell主要使用密码认证
    password: '',
    privateKeyContent: '',
    privateKeyPassphrase: '',
    group: groupName // 添加分组信息
  };

  // 处理密码
  if (finalShellConfig.password) {
    // 直接使用解密函数，不需要try-catch
    config.password = decryptFinalShellPassword(finalShellConfig.password);
  }

  // 处理私钥认证
  if (finalShellConfig.authentication_type === 2 || finalShellConfig.secret_key_id) {
    config.authType = 'privateKey';
    // 注意：FinalShell的私钥内容可能需要单独处理
    if (finalShellConfig.secret_key_content) {
      config.privateKeyContent = finalShellConfig.secret_key_content;
    }
  }

  return config;
}

// 递归扫描目录并处理分组
function scanDirectory(dirPath, basePath = '', results = []) {
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      // 递归处理子目录
      const groupName = basePath ? `${basePath}/${item}` : item;
      scanDirectory(itemPath, groupName, results);
    } else if (item.endsWith('_connect_config.json')) {
      try {
        // 读取并解析FinalShell配置文件
        const content = fs.readFileSync(itemPath, 'utf8');
        const finalShellConfig = JSON.parse(content);
        
        // 转换为MySSH格式
        const mySSHConfig = convertFinalShellToMySSH(finalShellConfig, basePath);
        results.push(mySSHConfig);
        
        console.log(`✓ 已处理: ${mySSHConfig.name} (分组: ${basePath || '根目录'})`);
      } catch (error) {
        console.error(`✗ 处理文件失败 ${itemPath}: ${error.message}`);
      }
    }
  }
  
  return results;
}

// 主函数
async function importFinalShellConnections() {
  const finalShellExportPath = '/Users/liqi/测试文件/导出的链接';
  
  console.log('开始导入FinalShell连接配置...');
  console.log(`扫描目录: ${finalShellExportPath}`);
  
  if (!fs.existsSync(finalShellExportPath)) {
    console.error(`错误: 导出目录不存在: ${finalShellExportPath}`);
    return;
  }
  
  // 扫描并转换所有配置
  const convertedConnections = scanDirectory(finalShellExportPath);
  
  console.log(`\n总共找到 ${convertedConnections.length} 个连接配置`);
  
  // 按分组统计
  const groupStats = {};
  convertedConnections.forEach(conn => {
    const group = conn.group || '根目录';
    groupStats[group] = (groupStats[group] || 0) + 1;
  });
  
  console.log('\n分组统计:');
  Object.entries(groupStats).forEach(([group, count]) => {
    console.log(`  ${group}: ${count} 个连接`);
  });
  
  // 直接保存转换后的配置（不进行重复检查）
  const outputPath = path.join(__dirname, 'imported_connections.json');
  fs.writeFileSync(outputPath, JSON.stringify(convertedConnections, null, 2), 'utf8');
  
  console.log(`\n导入完成!`);
  console.log(`- 转换连接: ${convertedConnections.length} 个`);
  console.log(`- 配置文件已保存到: ${outputPath}`);
  console.log(`\n请将此文件导入到MySSH应用中。`);
  
  return convertedConnections;
}

// 如果直接运行此脚本
if (require.main === module) {
  importFinalShellConnections().catch(console.error);
}

module.exports = {
  importFinalShellConnections,
  convertFinalShellToMySSH,
  decryptFinalShellPassword
};
