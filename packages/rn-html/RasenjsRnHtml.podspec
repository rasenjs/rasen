require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "RasenjsRnHtml"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  # Pinned explicitly rather than using `min_ios_version_supported` (that helper
  # only exists inside the app's Podfile, so it breaks standalone linting).
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/rasenjs/rasen.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm}"

  # Legacy interop and RCTViewManager come from React-Core.
  s.dependency "React-Core"
end
