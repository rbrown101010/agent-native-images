import AppKit
import Foundation

let output = CommandLine.arguments[1]
func png(_ size: Int, tray: Bool = false) -> Data {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    let s = CGFloat(size)
    if !tray {
        NSColor(calibratedWhite: 0.09, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: s * 0.04, y: s * 0.04, width: s * 0.92, height: s * 0.92), xRadius: s * 0.20, yRadius: s * 0.20).fill()
    }
    (tray ? NSColor.black : NSColor(calibratedWhite: 0.93, alpha: 1)).setStroke()
    let frame = NSBezierPath(roundedRect: NSRect(x: s * 0.21, y: s * 0.24, width: s * 0.58, height: s * 0.52), xRadius: s * 0.065, yRadius: s * 0.065)
    frame.lineWidth = s * 0.035
    frame.stroke()
    let mountain = NSBezierPath()
    mountain.move(to: NSPoint(x: s * 0.23, y: s * 0.34))
    mountain.line(to: NSPoint(x: s * 0.41, y: s * 0.52))
    mountain.line(to: NSPoint(x: s * 0.54, y: s * 0.39))
    mountain.line(to: NSPoint(x: s * 0.63, y: s * 0.48))
    mountain.line(to: NSPoint(x: s * 0.78, y: s * 0.33))
    mountain.lineWidth = s * 0.035
    mountain.lineJoinStyle = .round
    mountain.stroke()
    (tray ? NSColor.black : NSColor(calibratedWhite: 0.93, alpha: 1)).setFill()
    NSBezierPath(ovalIn: NSRect(x: s * 0.56, y: s * 0.59, width: s * 0.075, height: s * 0.075)).fill()
    image.unlockFocus()
    return NSBitmapImageRep(data: image.tiffRepresentation!)!.representation(using: .png, properties: [:])!
}
try FileManager.default.createDirectory(atPath: output + "/icon.iconset", withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    try png(size).write(to: URL(fileURLWithPath: output + "/icon.iconset/icon_\(size)x\(size).png"))
    try png(size * 2).write(to: URL(fileURLWithPath: output + "/icon.iconset/icon_\(size)x\(size)@2x.png"))
}
try png(36, tray: true).write(to: URL(fileURLWithPath: output + "/tray.png"))
