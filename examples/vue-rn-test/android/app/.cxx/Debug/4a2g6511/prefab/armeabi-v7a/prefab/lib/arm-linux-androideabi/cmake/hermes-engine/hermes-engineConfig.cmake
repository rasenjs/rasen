if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "/Users/wuhaofeng/.gradle/caches/8.13/transforms/5231ba3d5e7d6b1a82065a81bb4c9381/transformed/hermes-android-250829098.0.10-debug/prefab/modules/hermesvm/libs/android.armeabi-v7a/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/wuhaofeng/.gradle/caches/8.13/transforms/5231ba3d5e7d6b1a82065a81bb4c9381/transformed/hermes-android-250829098.0.10-debug/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

