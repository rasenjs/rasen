/**
 * @flow strict-local
 *
 * 迁移自 react-native v0.86.0 官方测试:
 * packages/react-native/Libraries/Text/__tests__/Text-test.js
 *
 * 只改 require 路径(指向 node_modules/react-native),其余逻辑/断言原样保留。
 * 运行配置:jest.official.config.cjs(沿用官方 setup,不加载 rn-dom setup.ts)。
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * Licensed under the MIT license found in the LICENSE file in the root directory of this source tree.
 */
// 迁移适配:提升 jest.dontMock/unmock 到顶部(require 之前),
// 让"真实组件"意图在 preset(mock 组件)环境下生效。
jest.dontMock('react-native/Libraries/Text/Text');
jest.dontMock('react-native/Libraries/Text/TextNativeComponent');

import type {ReactTestRendererJSON} from 'react-native/Libraries/Utilities/ReactNativeTestTools';
import type {ReactTestRenderer} from 'react-test-renderer';

import flattenStyle from 'react-native/Libraries/StyleSheet/flattenStyle';
import {create} from '@react-native/jest-preset/jest/renderer';
import * as React from 'react';

const Text = require('react-native/Libraries/Text/Text').default;


function omitRefAndFlattenStyle(instance: ReactTestRenderer) {
  const json = instance.toJSON();
  if (json == null) {
    throw new Error('Expected `instance.toJSON()` to be non-null');
  }

  function processNode(node: ReactTestRendererJSON): ReactTestRendererJSON {
    if (node == null || typeof node !== 'object') {
      return node;
    }

    if (node.props) {
      // Omit `ref` for forward-compatibility with `enableRefAsProp`.
      delete node.props.ref;
      // Omit event handlers
      delete node.props.onClick;
      delete node.props.onResponderGrant;
      delete node.props.onResponderMove;
      delete node.props.onResponderRelease;
      delete node.props.onResponderTerminate;
      delete node.props.onResponderTerminationRequest;
      delete node.props.onStartShouldSetResponder;
      // Flatten style
      node.props.style = flattenStyle(node.props.style);
    }

    // Process children recursively
    if (node.children) {
      node.children = node.children.map(processNode);
    }

    return node;
  }

  return processNode(json);
}

describe('Text', () => {
  it('default render', async () => {
    const instance = await create(<Text />);

    expect(omitRefAndFlattenStyle(instance)).toMatchInlineSnapshot(`
      <RCTText
        accessible={true}
        allowFontScaling={true}
        ellipsizeMode="tail"
        style={
          Object {
            "overflow": "hidden",
          }
        }
      />
    `);
  });

  it('has displayName', () => {
    expect(Text.displayName).toEqual('Text');
  });

  describe('accessibilityRole with onPress/onLongPress', () => {
    it('automatically sets accessibilityRole="link" when onPress is provided', async () => {
      const instance = await create(
        <Text onPress={() => {}}>Clickable Text</Text>,
      );

      expect(omitRefAndFlattenStyle(instance)).toMatchInlineSnapshot(`
        <RCTText
          accessibilityRole="link"
          accessible={true}
          allowFontScaling={true}
          ellipsizeMode="tail"
          isHighlighted={false}
          isPressable={true}
          style={
            Object {
              "overflow": "hidden",
            }
          }
        >
          Clickable Text
        </RCTText>
      `);
    });

    it('automatically sets accessibilityRole="link" when onLongPress is provided', async () => {
      const instance = await create(
        <Text onLongPress={() => {}}>Long Press Text</Text>,
      );

      expect(omitRefAndFlattenStyle(instance)).toMatchInlineSnapshot(`
        <RCTText
          accessibilityRole="link"
          accessible={true}
          allowFontScaling={true}
          ellipsizeMode="tail"
          isHighlighted={false}
          isPressable={true}
          style={
            Object {
              "overflow": "hidden",
            }
          }
        >
          Long Press Text
        </RCTText>
      `);
    });

    it('automatically sets accessibilityRole="link" when onStartShouldSetResponder is provided', async () => {
      const instance = await create(
        <Text onStartShouldSetResponder={() => true}>Responder Text</Text>,
      );

      expect(omitRefAndFlattenStyle(instance)).toMatchInlineSnapshot(`
        <RCTText
          accessibilityRole="link"
          accessible={true}
          allowFontScaling={true}
          ellipsizeMode="tail"
          isHighlighted={false}
          isPressable={true}
          style={
            Object {
              "overflow": "hidden",
            }
          }
        >
          Responder Text
        </RCTText>
      `);
    });

    it('respects explicit accessibilityRole', async () => {
      const instance = await create(
        <Text accessibilityRole="button" onPress={() => {}}>
          Explicit Button Role
        </Text>,
      );

      expect(omitRefAndFlattenStyle(instance)).toMatchInlineSnapshot(`
        <RCTText
          accessibilityRole="button"
          accessible={true}
          allowFontScaling={true}
          ellipsizeMode="tail"
          isHighlighted={false}
          isPressable={true}
          style={
            Object {
              "overflow": "hidden",
            }
          }
        >
          Explicit Button Role
        </RCTText>
      `);
    });

    it('respects explicit role prop', async () => {
      // $FlowFixMe[prop-missing]
      const instance = await create(
        <Text onPress={() => {}} role="button">
          Explicit Role Prop
        </Text>,
      );

      expect(omitRefAndFlattenStyle(instance)).toMatchInlineSnapshot(`
        <RCTText
          accessible={true}
          allowFontScaling={true}
          ellipsizeMode="tail"
          isHighlighted={false}
          isPressable={true}
          role="button"
          style={
            Object {
              "overflow": "hidden",
            }
          }
        >
          Explicit Role Prop
        </RCTText>
      `);
    });

    it('does not automatically set accessibilityRole when disabled', async () => {
      const instance = await create(
        <Text disabled onPress={() => {}}>
          Disabled Pressable Text
        </Text>,
      );

      expect(omitRefAndFlattenStyle(instance)).toMatchInlineSnapshot(`
        <RCTText
          accessibilityState={
            Object {
              "disabled": true,
            }
          }
          accessible={true}
          allowFontScaling={true}
          disabled={true}
          ellipsizeMode="tail"
          style={
            Object {
              "overflow": "hidden",
            }
          }
        >
          Disabled Pressable Text
        </RCTText>
      `);
    });

    it('automatically sets accessibilityRole="link" for nested Text with onPress', async () => {
      const instance = await create(
        <Text>
          Parent Text<Text onPress={() => {}}>Nested Clickable Link</Text>
        </Text>,
      );

      expect(omitRefAndFlattenStyle(instance)).toMatchInlineSnapshot(`
        <RCTText
          accessible={true}
          allowFontScaling={true}
          ellipsizeMode="tail"
          style={
            Object {
              "overflow": "hidden",
            }
          }
        >
          Parent Text
          <RCTText
            accessibilityRole="link"
            isHighlighted={false}
            isPressable={true}
            style={
              Object {
                "overflow": "hidden",
              }
            }
          >
            Nested Clickable Link
          </RCTText>
        </RCTText>
      `);
    });

    it('does not set accessibilityRole when no press handlers are provided', async () => {
      const instance = await create(<Text>Non-pressable Text</Text>);

      expect(omitRefAndFlattenStyle(instance)).toMatchInlineSnapshot(`
        <RCTText
          accessible={true}
          allowFontScaling={true}
          ellipsizeMode="tail"
          style={
            Object {
              "overflow": "hidden",
            }
          }
        >
          Non-pressable Text
        </RCTText>
      `);
    });
  });
});

describe('Text compat with web', () => {
  it('renders core props', async () => {
    const props = {
      id: 'id',
      tabIndex: 0,
      testID: 'testID',
    };

    // $FlowFixMe[incompatible-type]
    const instance = await create(<Text {...props} />);

    expect(omitRefAndFlattenStyle(instance)).toMatchInlineSnapshot(`
      <RCTText
        accessible={true}
        allowFontScaling={true}
        ellipsizeMode="tail"
        nativeID="id"
        style={
          Object {
            "overflow": "hidden",
          }
        }
        tabIndex={0}
        testID="testID"
      />
    `);
  });

  it('renders "aria-*" props', async () => {
    const props = {
      'aria-activedescendant': 'activedescendant',
      'aria-atomic': true,
      'aria-autocomplete': 'list',
      'aria-busy': true,
      'aria-checked': true,
      'aria-columncount': 5,
      'aria-columnindex': 3,
      'aria-columnspan': 2,
      'aria-controls': 'controls',
      'aria-current': 'current',
      'aria-describedby': 'describedby',
      'aria-details': 'details',
      'aria-disabled': true,
      'aria-errormessage': 'errormessage',
      'aria-expanded': true,
      'aria-flowto': 'flowto',
      'aria-haspopup': true,
      'aria-hidden': true,
      'aria-invalid': true,
      'aria-keyshortcuts': 'Cmd+S',
      'aria-label': 'label',
      'aria-labelledby': 'labelledby',
      'aria-level': 3,
      'aria-live': 'polite',
      'aria-modal': true,
      'aria-multiline': true,
      'aria-multiselectable': true,
      'aria-orientation': 'portrait',
      'aria-owns': 'owns',
      'aria-placeholder': 'placeholder',
      'aria-posinset': 5,
      'aria-pressed': true,
      'aria-readonly': true,
      'aria-required': true,
      role: 'main',
      'aria-roledescription': 'roledescription',
      'aria-rowcount': 5,
      'aria-rowindex': 3,
      'aria-rowspan': 3,
      'aria-selected': true,
      'aria-setsize': 5,
      'aria-sort': 'ascending',
      'aria-valuemax': 5,
      'aria-valuemin': 0,
      'aria-valuenow': 3,
      'aria-valuetext': '3',
    };

    // $FlowFixMe[prop-missing]
    // $FlowFixMe[incompatible-type]
    const instance = await create(<Text {...props} />);

    expect(omitRefAndFlattenStyle(instance)).toMatchInlineSnapshot(`
      <RCTText
        accessibilityElementsHidden={true}
        accessibilityLabel="label"
        accessibilityState={
          Object {
            "busy": true,
            "checked": true,
            "disabled": true,
            "expanded": true,
            "selected": true,
          }
        }
        accessible={true}
        allowFontScaling={true}
        aria-activedescendant="activedescendant"
        aria-atomic={true}
        aria-autocomplete="list"
        aria-columncount={5}
        aria-columnindex={3}
        aria-columnspan={2}
        aria-controls="controls"
        aria-current="current"
        aria-describedby="describedby"
        aria-details="details"
        aria-errormessage="errormessage"
        aria-flowto="flowto"
        aria-haspopup={true}
        aria-invalid={true}
        aria-keyshortcuts="Cmd+S"
        aria-labelledby="labelledby"
        aria-level={3}
        aria-live="polite"
        aria-modal={true}
        aria-multiline={true}
        aria-multiselectable={true}
        aria-orientation="portrait"
        aria-owns="owns"
        aria-placeholder="placeholder"
        aria-posinset={5}
        aria-pressed={true}
        aria-readonly={true}
        aria-required={true}
        aria-roledescription="roledescription"
        aria-rowcount={5}
        aria-rowindex={3}
        aria-rowspan={3}
        aria-setsize={5}
        aria-sort="ascending"
        aria-valuemax={5}
        aria-valuemin={0}
        aria-valuenow={3}
        aria-valuetext="3"
        disabled={true}
        ellipsizeMode="tail"
        importantForAccessibility="no-hide-descendants"
        role="main"
        style={
          Object {
            "overflow": "hidden",
          }
        }
      />
    `);
  });

  it('renders styles', async () => {
    const style = {
      display: 'flex',
      flex: 1,
      backgroundColor: 'white',
      marginInlineStart: 10,
      userSelect: 'none',
      verticalAlign: 'middle',
    };

    // $FlowFixMe[prop-missing]
    // $FlowFixMe[incompatible-type]
    const instance = await create(<Text style={style} />);

    expect(omitRefAndFlattenStyle(instance)).toMatchInlineSnapshot(`
      <RCTText
        accessible={true}
        allowFontScaling={true}
        ellipsizeMode="tail"
        selectable={false}
        style={
          Object {
            "backgroundColor": "white",
            "display": "flex",
            "flex": 1,
            "marginInlineStart": 10,
            "overflow": "hidden",
            "textAlignVertical": "center",
            "userSelect": undefined,
            "verticalAlign": undefined,
          }
        }
      />
    `);
  });
});
