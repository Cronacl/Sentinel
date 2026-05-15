import ApplicationServices
import AppKit
import CoreGraphics
import Foundation

func jsonString(_ value: Any) -> String {
  let data = try! JSONSerialization.data(withJSONObject: value, options: [])
  return String(data: data, encoding: .utf8)!
}

func emit(_ value: Any) {
  print(jsonString(value))
}

func cursorPayload() -> [String: Double] {
  let point = CGEvent(source: nil)?.location ?? CGPoint(x: 0, y: 0)
  return ["x": point.x, "y": point.y]
}

func displaysPayload() -> [[String: Any]] {
  var count: UInt32 = 0
  CGGetActiveDisplayList(0, nil, &count)
  var displays = Array(repeating: CGDirectDisplayID(0), count: Int(count))
  CGGetActiveDisplayList(count, &displays, &count)
  let primary = CGMainDisplayID()

  return displays.map { display in
    let bounds = CGDisplayBounds(display)
    return [
      "bounds": [
        "height": bounds.height,
        "width": bounds.width,
        "x": bounds.origin.x,
        "y": bounds.origin.y,
      ],
      "id": Int(display),
      "primary": display == primary,
      "scaleFactor": 1,
    ]
  }
}

func statusPayload() -> [String: Any] {
  return [
    "accessibilityTrusted": AXIsProcessTrusted(),
    "cursor": cursorPayload(),
    "displays": displaysPayload(),
    "platform": "darwin",
    "screenCaptureTrusted": CGPreflightScreenCaptureAccess(),
    "supported": true,
    "type": "status",
  ]
}

func mouseButton(_ button: String) -> CGMouseButton {
  switch button {
  case "right": return .right
  case "middle": return .center
  default: return .left
  }
}

func mouseEventType(_ down: Bool, _ button: String) -> CGEventType {
  switch button {
  case "right": return down ? .rightMouseDown : .rightMouseUp
  case "middle": return down ? .otherMouseDown : .otherMouseUp
  default: return down ? .leftMouseDown : .leftMouseUp
  }
}

func flags(_ modifiers: [String]) -> CGEventFlags {
  var result = CGEventFlags()
  for modifier in modifiers {
    switch modifier {
    case "command": result.insert(.maskCommand)
    case "control": result.insert(.maskControl)
    case "option": result.insert(.maskAlternate)
    case "shift": result.insert(.maskShift)
    default: break
    }
  }
  return result
}

func pointFromAny(_ value: Any) -> CGPoint? {
  if let pair = value as? [Double], pair.count >= 2 {
    return CGPoint(x: pair[0], y: pair[1])
  }

  if let pair = value as? [NSNumber], pair.count >= 2 {
    return CGPoint(x: pair[0].doubleValue, y: pair[1].doubleValue)
  }

  if let payload = value as? [String: Any] {
    let x = (payload["x"] as? NSNumber)?.doubleValue ?? payload["x"] as? Double
    let y = (payload["y"] as? NSNumber)?.doubleValue ?? payload["y"] as? Double
    if let x, let y {
      return CGPoint(x: x, y: y)
    }
  }

  return nil
}

func postMove(x: Double, y: Double, modifiers: [String] = []) {
  let event = CGEvent(
    mouseEventSource: nil,
    mouseType: .mouseMoved,
    mouseCursorPosition: CGPoint(x: x, y: y),
    mouseButton: .left
  )
  event?.flags = flags(modifiers)
  event?.post(tap: .cghidEventTap)
}

func postClick(
  x: Double,
  y: Double,
  button: String,
  count: Int,
  modifiers: [String] = []
) {
  let cgButton = mouseButton(button)
  let point = CGPoint(x: x, y: y)
  let eventFlags = flags(modifiers)
  for click in 1...max(1, count) {
    let down = CGEvent(
      mouseEventSource: nil,
      mouseType: mouseEventType(true, button),
      mouseCursorPosition: point,
      mouseButton: cgButton
    )
    let up = CGEvent(
      mouseEventSource: nil,
      mouseType: mouseEventType(false, button),
      mouseCursorPosition: point,
      mouseButton: cgButton
    )
    down?.flags = eventFlags
    up?.flags = eventFlags
    down?.setIntegerValueField(.mouseEventClickState, value: Int64(click))
    up?.setIntegerValueField(.mouseEventClickState, value: Int64(click))
    down?.post(tap: .cghidEventTap)
    up?.post(tap: .cghidEventTap)
    usleep(60_000)
  }
}

func postDrag(
  path: [CGPoint],
  button: String,
  durationMs: Int,
  modifiers: [String] = []
) {
  guard path.count >= 2 else { return }

  let cgButton = mouseButton(button)
  let eventFlags = flags(modifiers)
  let first = path[0]
  let last = path[path.count - 1]
  let stepDelay = useconds_t(
    max(0, durationMs) * 1_000 / max(1, path.count - 1)
  )

  let down = CGEvent(
    mouseEventSource: nil,
    mouseType: mouseEventType(true, button),
    mouseCursorPosition: first,
    mouseButton: cgButton
  )
  down?.flags = eventFlags
  down?.post(tap: .cghidEventTap)

  for point in path.dropFirst() {
    let drag = CGEvent(
      mouseEventSource: nil,
      mouseType: button == "right" ? .rightMouseDragged : .leftMouseDragged,
      mouseCursorPosition: point,
      mouseButton: cgButton
    )
    drag?.flags = eventFlags
    drag?.post(tap: .cghidEventTap)
    if stepDelay > 0 {
      usleep(stepDelay)
    }
  }

  let up = CGEvent(
    mouseEventSource: nil,
    mouseType: mouseEventType(false, button),
    mouseCursorPosition: last,
    mouseButton: cgButton
  )
  up?.flags = eventFlags
  up?.post(tap: .cghidEventTap)
}

func postScroll(deltaX: Double, deltaY: Double, modifiers: [String] = []) {
  let event = CGEvent(
    scrollWheelEvent2Source: nil,
    units: .pixel,
    wheelCount: 2,
    wheel1: Int32(deltaY),
    wheel2: Int32(deltaX),
    wheel3: 0
  )
  event?.flags = flags(modifiers)
  event?.post(tap: .cghidEventTap)
}

let keyCodes: [String: CGKeyCode] = [
  "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7,
  "c": 8, "v": 9, "b": 11, "q": 12, "w": 13, "e": 14, "r": 15,
  "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22,
  "5": 23, "=": 24, "9": 25, "7": 26, "-": 27, "8": 28, "0": 29,
  "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35, "return": 36,
  "enter": 36, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42,
  ",": 43, "/": 44, "n": 45, "m": 46, ".": 47, "tab": 48, "space": 49,
  "`": 50, "delete": 51, "backspace": 51, "escape": 53, "esc": 53,
  "command": 55, "shift": 56, "capslock": 57, "option": 58, "control": 59,
  "rightshift": 60, "rightoption": 61, "rightcontrol": 62, "fn": 63,
  "f17": 64, "volumeup": 72, "volumedown": 73, "mute": 74, "f18": 79,
  "f19": 80, "f20": 90, "f5": 96, "f6": 97, "f7": 98, "f3": 99,
  "f8": 100, "f9": 101, "f11": 103, "f13": 105, "f16": 106, "f14": 107,
  "f10": 109, "f12": 111, "f15": 113, "help": 114, "home": 115,
  "pageup": 116, "forwarddelete": 117, "f4": 118, "end": 119, "f2": 120,
  "pagedown": 121, "f1": 122, "left": 123, "right": 124, "down": 125,
  "up": 126,
]

func postKey(key: String, modifiers: [String]) throws {
  let normalized = key.lowercased()
  guard let code = keyCodes[normalized] else {
    throw NSError(
      domain: "SentinelComputerUse",
      code: 2,
      userInfo: [NSLocalizedDescriptionKey: "Unsupported key: \(key)"]
    )
  }
  let eventFlags = flags(modifiers)
  let down = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true)
  let up = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false)
  down?.flags = eventFlags
  up?.flags = eventFlags
  down?.post(tap: .cghidEventTap)
  up?.post(tap: .cghidEventTap)
}

func postText(_ text: String) {
  for scalar in text.unicodeScalars {
    var value = UniChar(scalar.value)
    let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true)
    down?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
    down?.post(tap: .cghidEventTap)
    let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false)
    up?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
    up?.post(tap: .cghidEventTap)
    usleep(1_000)
  }
}

func requireTrusted() throws {
  if !AXIsProcessTrusted() {
    throw NSError(
      domain: "SentinelComputerUse",
      code: 1,
      userInfo: [
        NSLocalizedDescriptionKey:
          "macOS Accessibility permission is required for desktop computer actions."
      ]
    )
  }
}

func copyAttribute(_ element: AXUIElement, _ attribute: String) -> AnyObject? {
  var value: AnyObject?
  let error = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
  return error == .success ? value : nil
}

func stringAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
  if let value = copyAttribute(element, attribute) {
    return String(describing: value)
  }
  return nil
}

func boolAttribute(_ element: AXUIElement, _ attribute: String) -> Bool? {
  return copyAttribute(element, attribute) as? Bool
}

func axPoint(_ value: AnyObject?) -> CGPoint? {
  guard let value = value, CFGetTypeID(value) == AXValueGetTypeID() else {
    return nil
  }
  let axValue = value as! AXValue
  var point = CGPoint.zero
  return AXValueGetValue(axValue, .cgPoint, &point) ? point : nil
}

func axSize(_ value: AnyObject?) -> CGSize? {
  guard let value = value, CFGetTypeID(value) == AXValueGetTypeID() else {
    return nil
  }
  let axValue = value as! AXValue
  var size = CGSize.zero
  return AXValueGetValue(axValue, .cgSize, &size) ? size : nil
}

func actionNames(_ element: AXUIElement) -> [String] {
  var names: CFArray?
  let error = AXUIElementCopyActionNames(element, &names)
  guard error == .success, let names = names as? [String] else {
    return []
  }
  return names
}

func childElements(_ element: AXUIElement) -> [AXUIElement] {
  if let windows = copyAttribute(element, kAXWindowsAttribute) as? [AXUIElement],
    !windows.isEmpty
  {
    return windows
  }

  if let children = copyAttribute(element, kAXChildrenAttribute) as? [AXUIElement] {
    return children
  }

  return []
}

func runningApp(appName: String?, bundleId: String?) -> NSRunningApplication? {
  let apps = NSWorkspace.shared.runningApplications
  if let bundleId = bundleId, !bundleId.isEmpty {
    return apps.first { $0.bundleIdentifier == bundleId }
  }
  if let appName = appName, !appName.isEmpty {
    let normalized = appName.lowercased()
    return apps.first { app in
      app.localizedName?.lowercased() == normalized ||
        app.localizedName?.lowercased().contains(normalized) == true
    }
  }
  return NSWorkspace.shared.frontmostApplication
}

func appInfo(_ app: NSRunningApplication?) -> [String: Any]? {
  guard let app = app else { return nil }
  return [
    "bundleId": app.bundleIdentifier as Any,
    "name": app.localizedName ?? String(app.processIdentifier),
  ]
}

func targetAppElement(_ payload: [String: Any]) throws -> (
  app: NSRunningApplication?,
  element: AXUIElement
) {
  try requireTrusted()
  let appName = payload["appName"] as? String
  let bundleId = payload["bundleId"] as? String
  guard let app = runningApp(appName: appName, bundleId: bundleId) else {
    throw NSError(
      domain: "SentinelComputerUse",
      code: 6,
      userInfo: [NSLocalizedDescriptionKey: "Unable to find target macOS app."]
    )
  }
  return (app, AXUIElementCreateApplication(app.processIdentifier))
}

func nodePayload(_ element: AXUIElement, path: String) -> [String: Any] {
  var payload: [String: Any] = [
    "actions": actionNames(element),
    "axPath": path,
    "description": stringAttribute(element, kAXDescriptionAttribute) as Any,
    "enabled": boolAttribute(element, kAXEnabledAttribute) as Any,
    "focused": boolAttribute(element, kAXFocusedAttribute) as Any,
    "id": stringAttribute(element, kAXIdentifierAttribute) as Any,
    "role": stringAttribute(element, kAXRoleAttribute) as Any,
    "subrole": stringAttribute(element, kAXSubroleAttribute) as Any,
    "title": stringAttribute(element, kAXTitleAttribute) as Any,
    "value": stringAttribute(element, kAXValueAttribute) as Any,
  ]

  if let point = axPoint(copyAttribute(element, kAXPositionAttribute)),
    let size = axSize(copyAttribute(element, kAXSizeAttribute)),
    size.width > 0,
    size.height > 0
  {
    payload["bounds"] = [
      "height": size.height,
      "width": size.width,
      "x": point.x,
      "y": point.y,
    ]
  } else {
    payload["bounds"] = nil
  }

  return payload
}

func buildAxTree(
  _ element: AXUIElement,
  path: String,
  depth: Int,
  maxDepth: Int,
  maxNodes: Int,
  count: inout Int
) -> [String: Any]? {
  if count >= maxNodes {
    return nil
  }
  count += 1

  var payload = nodePayload(element, path: path)
  if depth < maxDepth {
    var childrenPayload: [[String: Any]] = []
    for (index, child) in childElements(element).enumerated() {
      if count >= maxNodes {
        break
      }
      let childPath = path.isEmpty ? "\(index)" : "\(path)/\(index)"
      if let childPayload = buildAxTree(
        child,
        path: childPath,
        depth: depth + 1,
        maxDepth: maxDepth,
        maxNodes: maxNodes,
        count: &count
      ) {
        childrenPayload.append(childPayload)
      }
    }
    if !childrenPayload.isEmpty {
      payload["children"] = childrenPayload
    }
  }

  return payload
}

func parsePayload(_ json: String) throws -> [String: Any] {
  let data = json.data(using: .utf8) ?? Data()
  return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
}

func axTree(_ json: String) throws -> [String: Any] {
  let payload = try parsePayload(json)
  let target = try targetAppElement(payload)
  let maxDepth = max(1, min(payload["maxDepth"] as? Int ?? 4, 8))
  let maxNodes = max(1, min(payload["maxNodes"] as? Int ?? 250, 1_000))
  var count = 0
  let root = buildAxTree(
    target.element,
    path: "",
    depth: 0,
    maxDepth: maxDepth,
    maxNodes: maxNodes,
    count: &count
  )

  return [
    "frontmostApp": appInfo(target.app) as Any,
    "nodeCount": count,
    "platform": "darwin",
    "root": root as Any,
    "supported": true,
    "type": "ax_tree",
  ]
}

func lower(_ value: Any?) -> String {
  guard let value = value else { return "" }
  return String(describing: value).lowercased()
}

func matchesQuery(_ node: [String: Any], _ query: [String: Any]) -> Bool {
  for key in ["role", "subrole", "title", "value", "description"] {
    guard let expected = query[key] as? String, !expected.isEmpty else {
      continue
    }
    if !lower(node[key]).contains(expected.lowercased()) {
      return false
    }
  }
  return true
}

func findAxElements(
  _ element: AXUIElement,
  path: String,
  depth: Int,
  maxDepth: Int,
  maxNodes: Int,
  maxMatches: Int,
  query: [String: Any],
  count: inout Int,
  matches: inout [[String: Any]]
) {
  if count >= maxNodes || matches.count >= maxMatches {
    return
  }
  count += 1
  let node = nodePayload(element, path: path)
  if matchesQuery(node, query) {
    matches.append(node)
  }
  if depth >= maxDepth {
    return
  }
  for (index, child) in childElements(element).enumerated() {
    let childPath = path.isEmpty ? "\(index)" : "\(path)/\(index)"
    findAxElements(
      child,
      path: childPath,
      depth: depth + 1,
      maxDepth: maxDepth,
      maxNodes: maxNodes,
      maxMatches: maxMatches,
      query: query,
      count: &count,
      matches: &matches
    )
    if count >= maxNodes || matches.count >= maxMatches {
      break
    }
  }
}

func axFind(_ json: String) throws -> [String: Any] {
  let payload = try parsePayload(json)
  let target = try targetAppElement(payload)
  let maxDepth = max(1, min(payload["maxDepth"] as? Int ?? 8, 10))
  let maxNodes = max(1, min(payload["maxNodes"] as? Int ?? 750, 2_000))
  let maxMatches = max(1, min(payload["maxMatches"] as? Int ?? 25, 100))
  let query = payload["query"] as? [String: Any] ?? [:]
  var count = 0
  var matches: [[String: Any]] = []
  findAxElements(
    target.element,
    path: "",
    depth: 0,
    maxDepth: maxDepth,
    maxNodes: maxNodes,
    maxMatches: maxMatches,
    query: query,
    count: &count,
    matches: &matches
  )

  return [
    "frontmostApp": appInfo(target.app) as Any,
    "matches": matches,
    "nodeCount": count,
    "platform": "darwin",
    "supported": true,
    "type": "ax_find",
  ]
}

func resolveAxPath(_ root: AXUIElement, _ path: String) -> AXUIElement? {
  if path.isEmpty {
    return root
  }
  var element = root
  for part in path.split(separator: "/") {
    guard let index = Int(part) else { return nil }
    let children = childElements(element)
    guard index >= 0 && index < children.count else { return nil }
    element = children[index]
  }
  return element
}

func firstMatchingElement(
  _ element: AXUIElement,
  path: String,
  depth: Int,
  maxDepth: Int,
  query: [String: Any],
  count: inout Int
) -> AXUIElement? {
  if count >= 1_000 {
    return nil
  }
  count += 1
  if matchesQuery(nodePayload(element, path: path), query) {
    return element
  }
  if depth >= maxDepth {
    return nil
  }
  for (index, child) in childElements(element).enumerated() {
    let childPath = path.isEmpty ? "\(index)" : "\(path)/\(index)"
    if let match = firstMatchingElement(
      child,
      path: childPath,
      depth: depth + 1,
      maxDepth: maxDepth,
      query: query,
      count: &count
    ) {
      return match
    }
  }
  return nil
}

func axActionName(_ action: String) -> String? {
  switch action {
  case "press": return kAXPressAction
  case "increment": return kAXIncrementAction
  case "decrement": return kAXDecrementAction
  case "showMenu": return kAXShowMenuAction
  default: return nil
  }
}

func axAction(_ json: String) throws -> [String: Any] {
  let payload = try parsePayload(json)
  let target = try targetAppElement(payload)
  let action = payload["action"] as? String ?? ""
  let element: AXUIElement?
  if let axPath = payload["axPath"] as? String {
    element = resolveAxPath(target.element, axPath)
  } else if let query = payload["query"] as? [String: Any] {
    var count = 0
    element = firstMatchingElement(
      target.element,
      path: "",
      depth: 0,
      maxDepth: 10,
      query: query,
      count: &count
    )
  } else {
    element = nil
  }

  guard let element = element else {
    throw NSError(
      domain: "SentinelComputerUse",
      code: 7,
      userInfo: [NSLocalizedDescriptionKey: "Unable to resolve target AX element."]
    )
  }

  let error: AXError
  if action == "focus" {
    error = AXUIElementSetAttributeValue(
      element,
      kAXFocusedAttribute as CFString,
      kCFBooleanTrue
    )
  } else if action == "setValue" {
    let value = (payload["value"] as? String ?? "") as CFTypeRef
    error = AXUIElementSetAttributeValue(
      element,
      kAXValueAttribute as CFString,
      value
    )
  } else if let actionName = axActionName(action) {
    error = AXUIElementPerformAction(element, actionName as CFString)
  } else {
    throw NSError(
      domain: "SentinelComputerUse",
      code: 8,
      userInfo: [NSLocalizedDescriptionKey: "Unsupported AX action: \(action)"]
    )
  }

  var result: [String: Any] = [
    "action": action,
    "element": nodePayload(element, path: payload["axPath"] as? String ?? ""),
    "ok": error == .success,
    "platform": "darwin",
    "supported": true,
    "type": "ax_action",
  ]
  if error != .success {
    result["message"] = "AX action failed: \(error.rawValue)"
  }
  return result
}

func runActions(_ json: String) throws -> [String: Any] {
  try requireTrusted()
  let data = json.data(using: .utf8) ?? Data()
  let actions = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] ?? []
  var results: [[String: Any]] = []

  for (index, action) in actions.enumerated() {
    let type = action["type"] as? String ?? "unknown"
    do {
      switch type {
      case "wait":
        let durationMs = action["durationMs"] as? Int ?? 250
        usleep(useconds_t(max(0, min(durationMs, 10_000)) * 1_000))
      case "move":
        postMove(
          x: action["x"] as? Double ?? 0,
          y: action["y"] as? Double ?? 0,
          modifiers: action["modifiers"] as? [String] ?? []
        )
      case "click":
        postClick(
          x: action["x"] as? Double ?? 0,
          y: action["y"] as? Double ?? 0,
          button: action["button"] as? String ?? "left",
          count: action["clickCount"] as? Int ?? 1,
          modifiers: action["modifiers"] as? [String] ?? []
        )
      case "drag":
        let path = (action["path"] as? [Any] ?? []).compactMap(pointFromAny)
        postDrag(
          path: path,
          button: action["button"] as? String ?? "left",
          durationMs: action["durationMs"] as? Int ?? 250,
          modifiers: action["modifiers"] as? [String] ?? []
        )
      case "scroll":
        if let x = action["x"] as? Double, let y = action["y"] as? Double {
          postMove(
            x: x,
            y: y,
            modifiers: action["modifiers"] as? [String] ?? []
          )
        }
        postScroll(
          deltaX: action["deltaX"] as? Double ?? 0,
          deltaY: action["deltaY"] as? Double ?? 0,
          modifiers: action["modifiers"] as? [String] ?? []
        )
      case "type":
        postText(action["text"] as? String ?? "")
      case "keypress":
        try postKey(
          key: action["key"] as? String ?? "",
          modifiers: action["modifiers"] as? [String] ?? []
        )
      default:
        throw NSError(
          domain: "SentinelComputerUse",
          code: 3,
          userInfo: [NSLocalizedDescriptionKey: "Unsupported action: \(type)"]
        )
      }
      results.append(["index": index, "ok": true, "type": type])
    } catch {
      results.append([
        "index": index,
        "message": error.localizedDescription,
        "ok": false,
        "type": type,
      ])
      break
    }
  }

  return [
    "actions": results,
    "cursor": cursorPayload(),
    "platform": "darwin",
    "supported": true,
    "type": "action",
  ]
}

do {
  let args = CommandLine.arguments
  guard args.count >= 2 else {
    throw NSError(
      domain: "SentinelComputerUse",
      code: 4,
      userInfo: [NSLocalizedDescriptionKey: "Expected command."]
    )
  }

  switch args[1] {
  case "status":
    emit(statusPayload())
  case "action":
    emit(try runActions(args.count >= 3 ? args[2] : "[]"))
  case "ax_tree":
    emit(try axTree(args.count >= 3 ? args[2] : "{}"))
  case "ax_find":
    emit(try axFind(args.count >= 3 ? args[2] : "{}"))
  case "ax_action":
    emit(try axAction(args.count >= 3 ? args[2] : "{}"))
  default:
    throw NSError(
      domain: "SentinelComputerUse",
      code: 5,
      userInfo: [NSLocalizedDescriptionKey: "Unknown command: \(args[1])"]
    )
  }
} catch {
  emit(["error": error.localizedDescription, "ok": false])
  exit(1)
}
