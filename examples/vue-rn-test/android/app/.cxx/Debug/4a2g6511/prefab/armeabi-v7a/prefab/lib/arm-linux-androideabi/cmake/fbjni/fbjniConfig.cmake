if(NOT TARGET fbjni::fbjni)
add_library(fbjni::fbjni SHARED IMPORTED)
set_target_properties(fbjni::fbjni PROPERTIES
    IMPORTED_LOCATION "/Users/wuhaofeng/.gradle/caches/8.13/transforms/1c50bd473f95dfa25c59ea4ee2aadfa5/transformed/fbjni-0.7.0/prefab/modules/fbjni/libs/android.armeabi-v7a/libfbjni.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/wuhaofeng/.gradle/caches/8.13/transforms/1c50bd473f95dfa25c59ea4ee2aadfa5/transformed/fbjni-0.7.0/prefab/modules/fbjni/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

