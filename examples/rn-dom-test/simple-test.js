/**
 * @format
 */

const { AppRegistry } = require('react-native')
const { RNDocument, mountToContainer } = require('@rasenjs/rn-dom')
const { name: appName } = require('./app.json')

// Polyfill window for React Native bridgeless mode
if (typeof window === 'undefined') {
  global.window = global
}

// Polyfill performance object
if (typeof performance === 'undefined') {
  global.performance = { now: () => Date.now() }
}

AppRegistry.registerRunnable(appName, ({ rootTag }) => {
  console.log('[simple-test] Starting with rootTag:', rootTag)
  
  const doc = RNDocument.getOrCreate(rootTag)
  const body = doc.body
  
  // Create a simple view with red background
  const view = doc.createElement('View')
  view.setAttribute('style', {
    flex: 1,
    backgroundColor: '#ff0000',
    justifyContent: 'center',
    alignItems: 'center',
  })
  
  // Create text
  const text = doc.createElement('Text')
  text.setAttribute('style', {
    fontSize: 32,
    color: '#ffffff',
    fontWeight: 'bold',
  })
  const textNode = doc.createTextNode('Hello Rasen!')
  text.appendChild(textNode)
  view.appendChild(text)
  
  // Use mountToContainer instead of body.appendChild
  mountToContainer(rootTag, view)
  
  console.log('[simple-test] App mounted')
})
