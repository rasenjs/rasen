/**
 * react-native/Libraries/ReactPrivate/ReactNativePrivateInterface mock
 *
 * 仅用于让 vitest 解析该子路径（真实文件是 Flow 语法）。
 * 各测试文件的 vi.mock 会覆盖实际行为。
 */

const mock = {
  ReactNativeViewConfigRegistry: {
    register: () => {},
    get: () => ({}),
    customBubblingEventTypes: {},
    customDirectEventTypes: {}
  },
  createAttributePayload: (props: Record<string, unknown>) =>
    Object.keys(props).length > 0 ? { ...props } : null,
  diffAttributePayloads: () => null
}

export default mock