if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "/Users/wuhaofeng/.gradle/caches/8.13/transforms/78bb63152208d45920496f5a84dad634/transformed/hermes-android-0.76.9-debug/prefab/modules/libhermes/libs/android.armeabi-v7a/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/wuhaofeng/.gradle/caches/8.13/transforms/78bb63152208d45920496f5a84dad634/transformed/hermes-android-0.76.9-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

