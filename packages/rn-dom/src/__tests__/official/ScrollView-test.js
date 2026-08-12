/**
 * @flow strict-local
 *
 * 迁移自 react-native v0.86.0 官方测试:
 * packages/react-native/Libraries/Components/ScrollView/__tests__/ScrollView-test.js
 *
 * 只改 require 路径(指向 node_modules/react-native),其余逻辑/断言原样保留。
 * 运行配置:jest.official.config.cjs(沿用官方 setup,不加载 rn-dom setup.ts)。
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * Licensed under the MIT license found in the LICENSE file in the root directory of this source tree.
 */
// 迁移适配:提升 jest.dontMock/unmock 到顶部(require 之前),
// 让"真实组件"意图在 preset(mock 组件)环境下生效。
jest.dontMock('react-native/Libraries/Components/ScrollView/ScrollView');

'use strict';

const Text = require('react-native/Libraries/Text/Text').default;
const ReactNativeTestTools = require('react-native/Libraries/Utilities/ReactNativeTestTools');
const View = require('react-native/Libraries/Components/View/View').default;
const ScrollView = require('react-native/Libraries/Components/ScrollView/ScrollView').default;
const {
  create,
  unmount,
  update,
} = require('@react-native/jest-preset/jest/renderer');
const React = require('react');
const {createRef} = require('react');

describe('ScrollView', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('renders its children', async () => {
    await ReactNativeTestTools.expectRendersMatchingSnapshot(
      'ScrollView',
      () => (
        <ScrollView>
          <View>
            <Text>Hello World!</Text>
          </View>
        </ScrollView>
      ),
      () => {
      },
    );
  });

  it('mocks native methods and instance methods', async () => {
    jest.mock('react-native/Libraries/Components/ScrollView/ScrollView');

    const ref = createRef<?React.ElementRef<typeof ScrollView>>();
    await create(<ScrollView ref={ref} />);

    // $FlowFixMe[method-unbinding]
    expect(ref.current?.measure).toBeInstanceOf(jest.fn().constructor);
    expect(ref.current?.scrollTo).toBeInstanceOf(jest.fn().constructor);
  });

  describe('ref', () => {
    it('receives an instance or null', async () => {

      const scrollViewRef = jest.fn();
      const testRendererInstance = await create(
        <ScrollView ref={scrollViewRef} />,
      );

      expect(scrollViewRef).toHaveBeenLastCalledWith(
        expect.objectContaining({_nativeTag: expect.any(Number)}),
      );

      await unmount(testRendererInstance);

      expect(scrollViewRef).toHaveBeenLastCalledWith(null);
    });

    it('transitions between refs', async () => {

      const scrollViewRefA = jest.fn();
      const testRendererInstance = await create(
        <ScrollView ref={scrollViewRefA} />,
      );

      expect(scrollViewRefA).toHaveBeenLastCalledWith(
        expect.objectContaining({_nativeTag: expect.any(Number)}),
      );

      const scrollViewRefB = jest.fn();
      await update(testRendererInstance, <ScrollView ref={scrollViewRefB} />);

      expect(scrollViewRefA).toHaveBeenLastCalledWith(null);
      expect(scrollViewRefB).toHaveBeenLastCalledWith(
        expect.objectContaining({_nativeTag: expect.any(Number)}),
      );
    });
  });

  describe('innerViewRef', () => {
    it('receives an instance or null', async () => {

      const innerViewRef = jest.fn();
      const testRendererInstance = await create(
        <ScrollView innerViewRef={innerViewRef} />,
      );

      expect(innerViewRef).toHaveBeenLastCalledWith(
        expect.objectContaining({_nativeTag: expect.any(Number)}),
      );

      await unmount(testRendererInstance);

      expect(innerViewRef).toHaveBeenLastCalledWith(null);
    });

    it('transitions between refs', async () => {

      const innerViewRefA = jest.fn();
      const testRendererInstance = await create(
        <ScrollView innerViewRef={innerViewRefA} />,
      );

      expect(innerViewRefA).toHaveBeenLastCalledWith(
        expect.objectContaining({_nativeTag: expect.any(Number)}),
      );

      const innerViewRefB = jest.fn();

      await update(
        testRendererInstance,
        <ScrollView innerViewRef={innerViewRefB} />,
      );

      expect(innerViewRefA).toHaveBeenLastCalledWith(null);
      expect(innerViewRefB).toHaveBeenLastCalledWith(
        expect.objectContaining({_nativeTag: expect.any(Number)}),
      );
    });
  });

  describe('getInnerViewRef', () => {
    it('returns an instance', async () => {

      const ref = createRef<?React.ElementRef<typeof ScrollView>>();
      await create(<ScrollView ref={ref} />);
      const innerViewRef = ref.current?.getInnerViewRef();

      // This is checking if the ref acts like a host component. If we had an
      // `isHostComponent(ref)` method, that would be preferred.
      // $FlowFixMe[method-unbinding]
      expect(innerViewRef?.measure).toBeInstanceOf(jest.fn().constructor);
      // $FlowFixMe[method-unbinding]
      expect(innerViewRef?.measureLayout).toBeInstanceOf(jest.fn().constructor);
      // $FlowFixMe[method-unbinding]
      expect(innerViewRef?.measureInWindow).toBeInstanceOf(
        jest.fn().constructor,
      );
    });
  });
});
