/**
 * @rasenjs/rn-dom - Test Component
 * 
 * Simple test component to verify rn-dom functionality
 * 
 * Run with: npx react-native run-android
 */

import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { RNDocument, RNNode, RNCommentNode } from '@rasenjs/rn-dom'

export function TestRnDom() {
  const [testResult, setTestResult] = React.useState<string[]>([])
  const [passed, setPassed] = React.useState<boolean | null>(null)

  const runTests = React.useCallback(() => {
    const results: string[] = []
    
    try {
      // Test 1: RNDocument singleton
      const doc1 = RNDocument.getOrCreate()
      const doc2 = RNDocument.getOrCreate()
      if (doc1 === doc2) {
        results.push('✓ Test 1: RNDocument singleton works')
      } else {
        results.push('✗ Test 1: RNDocument singleton failed')
      }

      // Test 2: Create comment node
      const comment = doc1.createComment('test-marker')
      if (comment && comment.nodeValue === 'test-marker') {
        results.push('✓ Test 2: createComment works')
      } else {
        results.push('✗ Test 2: createComment failed')
      }

      // Test 3: Body exists
      const body = doc1.body
      if (body && body.appendChild) {
        results.push('✓ Test 3: body exists with appendChild')
      } else {
        results.push('✗ Test 3: body or appendChild missing')
      }

      // Test 4: Append comment to body
      const initialChildren = body._getFabricChildren()
      body.appendChild(comment)
      const afterAppendChildren = body._getFabricChildren()
      if (afterAppendChildren.length === initialChildren.length + 1) {
        results.push('✓ Test 4: appendChild works')
      } else {
        results.push('✗ Test 4: appendChild failed')
      }

      // Test 5: Remove child
      body.removeChild(comment)
      const afterRemoveChildren = body._getFabricChildren()
      if (afterRemoveChildren.length === initialChildren.length) {
        results.push('✓ Test 5: removeChild works')
      } else {
        results.push('✗ Test 5: removeChild failed')
      }

      setPassed(true)
    } catch (error: any) {
      results.push(`✗ Error: ${error.message}`)
      setPassed(false)
    }

    setTestResult(results)
  }, [])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>@rasenjs/rn-dom Test</Text>
      
      <TouchableOpacity style={styles.button} onPress={runTests}>
        <Text style={styles.buttonText}>Run Tests</Text>
      </TouchableOpacity>

      {testResult.map((result, index) => (
        <Text 
          key={index} 
          style={[
            styles.result,
            result.startsWith('✓') ? styles.pass : styles.fail
          ]}
        >
          {result}
        </Text>
      ))}

      {passed !== null && (
        <Text style={[styles.summary, passed ? styles.summaryPass : styles.summaryFail]}>
          {passed ? '✅ All tests passed!' : '❌ Some tests failed'}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
  result: {
    fontSize: 16,
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  pass: {
    color: '#34C759',
  },
  fail: {
    color: '#FF3B30',
  },
  summary: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    textAlign: 'center',
  },
  summaryPass: {
    color: '#34C759',
  },
  summaryFail: {
    color: '#FF3B30',
  },
})
