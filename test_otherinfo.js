#!/usr/bin/env node

/**
 * otherInfo 字段测试脚本
 * 用于测试端口转发配置的保存和解析
 */

// 模拟一个主机配置对象
const testHost = {
  id: 'test-001',
  name: '测试服务器',
  host: '192.168.1.100',
  port: 22,
  username: 'root',
  authType: 'password',
  password: 'test123',
  group: 'default',
  tunnels: [
    {
      name: 'MySQL隧道',
      type: 'local',
      listenHost: '127.0.0.1',
      listenPort: 3306,
      targetHost: '127.0.0.1',
      targetPort: 3306
    },
    {
      name: 'Redis隧道',
      type: 'local',
      listenHost: '127.0.0.1',
      listenPort: 6379,
      targetHost: '127.0.0.1',
      targetPort: 6379
    },
    {
      name: 'SOCKS代理',
      type: 'dynamic',
      listenHost: '127.0.0.1',
      listenPort: 1080,
      targetHost: '',
      targetPort: ''
    }
  ]
}

// 序列化函数（模拟保存）
function serializeHost(host) {
  const otherInfo = {
    portForwarding: host.tunnels || []
  }
  
  return {
    id: host.id,
    name: host.name,
    host: host.host,
    port: host.port,
    username: host.username,
    authType: host.authType,
    password: host.password,
    group: host.group,
    otherInfo: JSON.stringify(otherInfo)
  }
}

// 反序列化函数（模拟加载）
function parseHostOtherInfo(host) {
  try {
    if (host.otherInfo && typeof host.otherInfo === 'string') {
      const otherInfo = JSON.parse(host.otherInfo)
      host.tunnels = otherInfo.portForwarding || []
    } else if (!host.tunnels) {
      host.tunnels = []
    }
  } catch (error) {
    console.error('解析 otherInfo 失败:', error)
    host.tunnels = []
  }
  return host
}

// 运行测试
console.log('=== otherInfo 字段测试 ===\n')

console.log('1. 原始主机配置:')
console.log(JSON.stringify(testHost, null, 2))
console.log('\n')

console.log('2. 序列化后的配置（保存到数据库/文件）:')
const serialized = serializeHost(testHost)
console.log(JSON.stringify(serialized, null, 2))
console.log('\n')

console.log('3. otherInfo 字段内容:')
console.log(serialized.otherInfo)
console.log('\n')

console.log('4. 反序列化后的配置（从数据库/文件加载）:')
const parsed = parseHostOtherInfo({ ...serialized })
console.log(JSON.stringify(parsed, null, 2))
console.log('\n')

console.log('5. 验证端口转发配置:')
if (parsed.tunnels && parsed.tunnels.length === testHost.tunnels.length) {
  console.log('✅ 端口转发配置数量正确:', parsed.tunnels.length)
  
  parsed.tunnels.forEach((tunnel, index) => {
    const original = testHost.tunnels[index]
    const match = JSON.stringify(tunnel) === JSON.stringify(original)
    console.log(`  ${match ? '✅' : '❌'} 隧道 ${index + 1}: ${tunnel.name}`)
  })
} else {
  console.log('❌ 端口转发配置数量不匹配')
}
console.log('\n')

console.log('6. 测试空配置:')
const emptyHost = {
  name: '空配置',
  host: '192.168.1.200',
  port: 22,
  username: 'user'
}
const emptyParsed = parseHostOtherInfo(serializeHost(emptyHost))
console.log('tunnels:', emptyParsed.tunnels)
console.log(emptyParsed.tunnels && emptyParsed.tunnels.length === 0 ? '✅ 空配置正确' : '❌ 空配置错误')
console.log('\n')

console.log('7. 测试错误的 otherInfo:')
const invalidHost = {
  name: '错误配置',
  host: '192.168.1.300',
  port: 22,
  username: 'user',
  otherInfo: 'invalid json {'
}
const invalidParsed = parseHostOtherInfo(invalidHost)
console.log('tunnels:', invalidParsed.tunnels)
console.log(invalidParsed.tunnels && invalidParsed.tunnels.length === 0 ? '✅ 错误处理正确（降级为空数组）' : '❌ 错误处理失败')
console.log('\n')

console.log('=== 测试完成 ===')



